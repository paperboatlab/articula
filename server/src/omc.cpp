#include "articula/omc.hpp"

#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

#include <algorithm>
#include <atomic>
#include <cctype>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <mutex>
#include <optional>
#include <thread>
#include <utility>

#include <nlohmann/json.hpp>

namespace articula {
namespace {

namespace fs = std::filesystem;
using json = nlohmann::json;
using namespace std::chrono_literals;
using Clock = std::chrono::steady_clock;

std::string env(const char* name) {
  const char* v = std::getenv(name);
  return v ? v : "";
}

// paperboatd's socket (paperboat/docs/control.md).
fs::path control_socket() {
  fs::path dir = !env("PAPERBOAT_RUNTIME_DIR").empty() ? fs::path(env("PAPERBOAT_RUNTIME_DIR"))
                 : !env("XDG_RUNTIME_DIR").empty()     ? fs::path(env("XDG_RUNTIME_DIR")) / "paperboat"
                                                       : fs::temp_directory_path() / ("paperboat-" + std::to_string(getuid()));
  return dir / "control.sock";
}

// paperboatd: $PAPERBOATD, else beside `paperboat` on PATH.
std::string daemon_path() {
  if (!env("PAPERBOATD").empty()) return env("PAPERBOATD");
  const std::string path = env("PATH");
  for (std::size_t at = 0; at <= path.size();) {
    const std::size_t end = std::min(path.find(':', at), path.size());
    const fs::path p = fs::path(path.substr(at, end - at)) / "paperboatd";
    if (access(p.c_str(), X_OK) == 0) return p.string();
    at = end + 1;
  }
  return "";
}

int connect_unix(const fs::path& path) {
  sockaddr_un addr{};
  addr.sun_family = AF_UNIX;
  std::string p = path.string();
  int dir = -1;
#ifdef __linux__
  // A lease's socket under a long home passes sun_path's 108 bytes: reach it through its folder's fd.
  if (p.size() >= sizeof addr.sun_path && (dir = ::open(path.parent_path().c_str(), O_PATH | O_CLOEXEC)) >= 0)
    p = "/proc/self/fd/" + std::to_string(dir) + "/" + path.filename().string();
#endif
  if (p.size() >= sizeof addr.sun_path) throw OmcError("socket path too long: " + path.string());
  std::memcpy(addr.sun_path, p.c_str(), p.size() + 1);
  const int fd = ::socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);
  const bool ok = fd >= 0 && ::connect(fd, reinterpret_cast<sockaddr*>(&addr), sizeof addr) == 0;
  if (dir >= 0) ::close(dir);
  if (ok) return fd;
  if (fd >= 0) ::close(fd);
  return -1;
}

bool write_all(int fd, std::string_view data) {
  while (!data.empty()) {
    const ssize_t n = ::send(fd, data.data(), data.size(), MSG_NOSIGNAL);
    if (n <= 0) return false;
    data.remove_prefix(static_cast<std::size_t>(n));
  }
  return true;
}

// Reads exactly n bytes by `deadline`; false on timeout or a closed socket.
bool read_all(int fd, char* out, std::size_t n, Clock::time_point deadline) {
  while (n > 0) {
    const auto left = std::chrono::duration_cast<std::chrono::milliseconds>(deadline - Clock::now()).count();
    if (left <= 0) return false;
    pollfd p{fd, POLLIN, 0};
    if (::poll(&p, 1, static_cast<int>(std::min<long long>(left, 1'000'000))) <= 0) continue;
    const ssize_t r = ::recv(fd, out, n, 0);
    if (r <= 0) return false;
    out += r;
    n -= static_cast<std::size_t>(r);
  }
  return true;
}

// Every occurrence of `from` in `s` becomes `to`.
std::string replace_all(std::string s, const std::string& from, const std::string& to) {
  if (from.empty() || from == to) return s;
  for (std::size_t at = s.find(from); at != std::string::npos; at = s.find(from, at + to.size())) s.replace(at, from.size(), to);
  return s;
}

std::string trim(std::string s) {
  while (!s.empty() && std::isspace(static_cast<unsigned char>(s.back()))) s.pop_back();
  std::size_t i = 0;
  while (i < s.size() && std::isspace(static_cast<unsigned char>(s[i]))) ++i;
  return s.substr(i);
}

// `getErrorString()` as separate messages. omc writes one per line, a source span in brackets
// when it has one: `[/tmp/M.mo:18:5-18:10:writable] Error: …`.
std::vector<OmcMessage> parse_messages(std::string_view raw) {
  std::vector<OmcMessage> out;
  std::size_t at = 0;
  while (at < raw.size()) {
    const std::size_t end = raw.find('\n', at);
    std::string line = trim(std::string(raw.substr(at, end == std::string_view::npos ? raw.size() - at : end - at)));
    at = end == std::string_view::npos ? raw.size() : end + 1;
    if (line.empty()) continue;
    OmcMessage message;
    std::string text = line;
    if (line.front() == '[') {
      if (const std::size_t close = line.find(']'); close != std::string::npos) {
        const std::string inside = line.substr(1, close - 1);
        // A Windows path starts with its drive, `C:/Users/…/M.mo:18:5-…`: the file ends at the
        // first colon after it.
        const bool drive = inside.size() > 2 && std::isalpha(static_cast<unsigned char>(inside[0])) && inside[1] == ':' &&
                           (inside[2] == '/' || inside[2] == '\\');
        if (const std::size_t colon = inside.find(':', drive ? 2 : 0); colon != std::string::npos) {
          message.file = inside.substr(0, colon);
          std::size_t p = colon + 1;
          const auto number = [&](int& value) {
            const std::size_t start = p;
            while (p < inside.size() && std::isdigit(static_cast<unsigned char>(inside[p]))) ++p;
            if (p == start) return false;
            value = std::stoi(inside.substr(start, p - start));
            return true;
          };
          if (number(message.line) && p < inside.size() && inside[p] == ':') {
            ++p;
            number(message.column);
          }
        }
        text = trim(line.substr(close + 1));
      }
    }
    for (const auto& [prefix, level] : {std::pair{"Error:", "error"}, std::pair{"Warning:", "warning"},
                                        std::pair{"Notification:", "info"}, std::pair{"Info:", "info"}}) {
      if (text.rfind(prefix, 0) == 0) {
        message.level = level;
        text = trim(text.substr(std::string_view(prefix).size()));
        break;
      }
    }
    if (message.level.empty()) message.level = "info";
    if (text.empty()) continue;
    message.text = std::move(text);
    out.push_back(std::move(message));
  }
  return out;
}

}  // namespace

std::string_view name(OmcState state) {
  switch (state) {
    case OmcState::Ready: return "ready";
    case OmcState::Checking: return "checking";
    case OmcState::Failed: return "failed";
  }
  return "failed";
}

struct Omc::Impl {
  Options options;
  std::mutex mutex;  // the queue: one request in flight
  int control = -1;  // the paperboatd connection: the lease lives as long as it stays open
  int runtime = -1;  // <ipc>/runtime.sock, paperboat-runtime/0
  int next_id = 1;
  json lease;
  // host folder → the path omc sees (the lease's mounts); empty natively, where they are the same
  std::vector<std::pair<std::string, std::string>> paths;
  fs::path workdir;
  std::string version;
  std::string backend;
  OmcState state = OmcState::Ready;
  int restarts = 0;  // in a row
  bool started_once = false;
  bool shutting_down = false;  // a stop was asked for; never start again
  std::atomic<bool> cancelled{false};
  bool msl_tried = false;  // installed the MSL once, if the workspace lacked it  // Cancel ended the call in flight: fail it, don't retry it
  std::vector<std::string> replay;  // loadModel / loadFile calls that succeeded
  StatusFn status_fn;
  LogFn log_fn;
  mutable std::mutex state_mutex;
  std::string last_raw;             // getErrorString() as the last drain saw it
  std::vector<OmcMessage> last_msgs;

  void set_state(OmcState s) {
    {
      std::lock_guard lock(state_mutex);
      if (state == s) return;
      state = s;
    }
    if (status_fn) status_fn(s, version);
  }

  // One paperboat-control/0 request on the lease's connection (or another).
  json control_call(const std::string& op, const json& args) { return control_call(control, op, args); }
  json control_call(int fd, const std::string& op, const json& args) {
    const int id = next_id++;
    if (!write_all(fd, json{{"id", id}, {"op", op}, {"args", args}}.dump() + "\n")) throw OmcError("paperboatd went away");
    std::string line;
    for (char c;;) {
      if (!read_all(fd, &c, 1, Clock::now() + 30min)) throw OmcError("paperboatd went away");  // acquire may pull the image
      if (c != '\n') {
        line += c;
        continue;
      }
      const json m = json::parse(line, nullptr, false);
      line.clear();
      if (!m.is_object() || m.value("id", -1) != id) continue;  // an event
      if (!m.value("ok", false)) throw OmcError("paperboatd: " + m.value("error", std::string("refused ") + op));
      return m["result"];
    }
  }

  // paperboatd, started as the CLI starts it when it isn't running.
  int open_control() {
    const fs::path sock = control_socket();
    if (const int fd = connect_unix(sock); fd >= 0) return fd;
    const std::string d = daemon_path();
    if (d.empty()) throw OmcError("paperboatd not found: install Paperboat (the paperboat-cli package) or set PAPERBOATD");
    fs::create_directories(sock.parent_path());
    if (const pid_t pid = fork(); pid == 0) {
      setsid();
      const std::string log = (sock.parent_path() / "paperboatd.log").string();
      const int out = ::open(log.c_str(), O_WRONLY | O_CREAT | O_APPEND, 0600);
      const int in = ::open("/dev/null", O_RDONLY);
      if (in >= 0) dup2(in, 0);
      if (out >= 0) dup2(out, 1), dup2(out, 2);
      // nothing else of the server's: paperboatd (and the conmon it starts) outlive the server and
      // would hold its listening port
      close_range(3, ~0U, 0);
      execl(d.c_str(), d.c_str(), "--socket", sock.c_str(), static_cast<char*>(nullptr));
      _exit(127);
    }
    for (int i = 0; i < 200; ++i) {  // up to 20 s: a first start probes podman and docker
      std::this_thread::sleep_for(100ms);
      if (const int fd = connect_unix(sock); fd >= 0) return fd;
    }
    throw OmcError("paperboatd did not start; see " + (sock.parent_path() / "paperboatd.log").string());
  }

  void start() {
    if (shutting_down) throw OmcError("omc is shutting down");
    control = open_control();
    json args = {{"runtime", options.runtime}, {"mode", "session"}, {"owner", "articula:" + options.project.string()}};
    if (!options.project.empty()) args["project"] = fs::absolute(options.project).string(), args["policy"] = {{"writable_project", true}};
    lease = control_call("acquire", args);
    backend = lease.value("backend", "");
    workdir = lease.value("work", "");
    paths.clear();
    if (backend != "native") {  // the manifest's default mounts (paperboat/docs/control.md)
      if (!options.project.empty()) paths.emplace_back(fs::absolute(options.project).string(), "/work/project");
      paths.emplace_back(lease.value("work", ""), "/work/out");
      paths.emplace_back(lease.value("deps", ""), "/work/deps");
    }
    const fs::path sock = fs::path(lease.value("ipc", "")) / "runtime.sock";
    for (const auto until = Clock::now() + 5min; (runtime = connect_unix(sock)) < 0;) {  // the image may still be pulling
      if (Clock::now() > until) throw OmcError("omc did not start (" + sock.string() + ")");
      std::this_thread::sleep_for(100ms);
    }
    json hello;
    if (!read_frame(hello, Clock::now() + 2min) || hello.value("type", "") != "hello") throw OmcError("omc said no hello");
    version = hello["runtime"].value("version", "");
    started_once = true;
    exchange("cd(" + quote(workdir.string()) + ")", options.timeout);  // builds and results land in the lease's work folder
  }

  bool read_frame(json& out, Clock::time_point deadline) {
    char len[4];
    if (!read_all(runtime, len, 4, deadline)) return false;
    const std::uint32_t n = static_cast<unsigned char>(len[0]) | static_cast<unsigned char>(len[1]) << 8 |
                            static_cast<unsigned char>(len[2]) << 16 | static_cast<std::uint32_t>(static_cast<unsigned char>(len[3])) << 24;
    std::string body(n, '\0');
    if (!read_all(runtime, body.data(), n, deadline)) return false;
    out = json::parse(body, nullptr, false);
    return true;
  }

  // The lease goes with its connection: closing it releases omc, wherever it runs.
  void stop() {
    if (runtime >= 0) ::close(runtime);
    if (control >= 0) ::close(control);
    runtime = control = -1;
  }

  std::string to_omc(std::string s) const {
    for (const auto& [host, inside] : paths) s = replace_all(std::move(s), host, inside);
    return s;
  }
  std::string from_omc(std::string s) const {
    for (const auto& [host, inside] : paths) s = replace_all(std::move(s), inside, host);
    return s;
  }

  // One round trip; nullopt on timeout or a dead omc. Paths go in as omc sees them and come back as
  // the host has them.
  std::optional<std::string> exchange(std::string_view expr, std::chrono::milliseconds timeout) {
    const int id = next_id++;
    const std::string body = json{{"id", id}, {"op", "eval"}, {"args", {{"code", to_omc(std::string(expr))}}}}.dump();
    const std::uint32_t n = static_cast<std::uint32_t>(body.size());
    const char len[4] = {static_cast<char>(n), static_cast<char>(n >> 8), static_cast<char>(n >> 16), static_cast<char>(n >> 24)};
    if (!write_all(runtime, std::string_view(len, 4)) || !write_all(runtime, body)) return std::nullopt;
    for (const auto deadline = Clock::now() + timeout;;) {
      json m;
      if (!read_frame(m, deadline)) return std::nullopt;
      if (!m.is_object() || m.value("id", -1) != id || m.contains("type")) continue;  // a notification
      if (!m.value("ok", false)) {
        const json& e = m["error"];
        throw OmcError(e.is_object() ? e.value("message", std::string("omc failed")) : std::string("omc failed"));
      }
      std::string out = m["result"]["data"].value("text/plain", "");
      while (!out.empty() && (out.back() == '\n' || out.back() == '\r')) out.pop_back();
      return from_omc(std::move(out));
    }
  }

  std::string call(std::string_view expr, std::chrono::milliseconds timeout) {
    std::lock_guard lock(mutex);
    if (shutting_down) throw OmcError("omc is shutting down");
    if (state == OmcState::Failed && restarts > options.max_restarts) throw OmcError("omc failed: restarted " + std::to_string(restarts) + " times");
    set_state(OmcState::Checking);
    for (;;) {
      try {
        if (runtime < 0) {
          const bool again = started_once;
          start();
          if (again)  // a restart: load what the old omc had loaded
            for (const auto& r : replay) exchange(r, timeout);
        }
        cancelled = false;
        if (auto out = exchange(expr, timeout)) {
          restarts = 0;
          if ((expr.starts_with("loadModel(") || expr.starts_with("loadFile(")) && *out == "true")
            if (std::find(replay.begin(), replay.end(), expr) == replay.end()) replay.emplace_back(expr);
          set_state(OmcState::Ready);
          return *out;
        }
      } catch (const OmcError& e) {
        // omc's own refusal (an `eval` error) leaves the session up; anything else ends it
        const bool session_ok = runtime >= 0 && std::string_view(e.what()).find("went away") == std::string_view::npos;
        if (!session_ok) stop(), set_state(OmcState::Failed);
        else set_state(OmcState::Ready);
        throw;
      }
      stop();  // timed out or died: a new session, replayed, up to max_restarts in a row
      if (cancelled.exchange(false)) {
        set_state(OmcState::Ready);
        throw OmcError("cancelled");
      }
      if (++restarts > options.max_restarts) {
        set_state(OmcState::Failed);
        throw OmcError("omc did not answer `" + std::string(expr.substr(0, 60)) + "` within " +
                       std::to_string(timeout.count() / 1000) + " s; gave up after " +
                       std::to_string(options.max_restarts) + " restarts");
      }
    }
  }

  // Drain omc's message buffer into the last-drain cache and tell the log listener. One extra
  // round trip; callers decide when it is worth it.
  std::pair<std::string, std::vector<OmcMessage>> drain() {
    const std::string raw = trim(parse_value(call("getErrorString()", options.timeout)).atom);
    std::vector<OmcMessage> messages = parse_messages(raw);
    {
      std::lock_guard lock(state_mutex);
      last_raw = raw;
      last_msgs = messages;
    }
    if (log_fn)
      for (const auto& message : messages) log_fn(message);
    return {raw, std::move(messages)};
  }
};

Omc::Omc() : Omc(Options{}) {}
Omc::Omc(Options options) : impl_(std::make_unique<Impl>()) { impl_->options = std::move(options); }

Omc::~Omc() { impl_->stop(); }

std::string Omc::call(std::string_view expr) { return call(expr, impl_->options.timeout); }
std::string Omc::call(std::string_view expr, std::chrono::milliseconds timeout) {
  std::string out = impl_->call(expr, timeout);
  // A workspace's first model: the Modelica Standard Library isn't in its package volume yet. Install
  // it once (the network for that step only, as `paperboat package add omc Modelica` does) and load it.
  if (expr == "loadModel(Modelica)" && out != "true" && !impl_->msl_tried) {
    impl_->msl_tried = true;
    if (impl_->log_fn) impl_->log_fn({"info", "installing the Modelica Standard Library 4.1.0 into this workspace…", "", 0, 0});
    const auto [code, log] = script("if not installPackage(Modelica, \"4.1.0+maint.om\", exactMatch=true) then exit(1); end if;", true, std::chrono::minutes(10));
    if (code != 0 && impl_->log_fn) impl_->log_fn({"error", "the Modelica Standard Library could not be installed: " + log, "", 0, 0});
    out = impl_->call(expr, timeout);
  }
  return out;
}

void Omc::shutdown() {
  std::lock_guard lock(impl_->mutex);
  impl_->shutting_down = true;
  impl_->stop();
}

void Omc::set_project(const fs::path& project) {
  std::lock_guard lock(impl_->mutex);
  if (impl_->options.project == project) return;
  impl_->options.project = project;
  impl_->stop();
  std::erase_if(impl_->replay, [](const std::string& r) { return r.starts_with("loadFile("); });
  impl_->msl_tried = false;
}

void Omc::cancel() {
  // Not under the queue's lock (the call it ends holds it). omc can't stop a call, so the session
  // ends; the next call starts a new one and loads again what this one had.
  impl_->cancelled = true;
  if (const int fd = impl_->runtime; fd >= 0) ::shutdown(fd, SHUT_RDWR);
}

std::string Omc::errors() { return impl_->drain().first; }

std::vector<OmcMessage> Omc::messages() { return impl_->drain().second; }

std::vector<OmcMessage> Omc::last_messages() const {
  std::lock_guard lock(impl_->state_mutex);
  return impl_->last_msgs;
}

std::string Omc::take_errors() {
  std::lock_guard lock(impl_->state_mutex);
  std::string raw = std::move(impl_->last_raw);
  impl_->last_raw.clear();
  impl_->last_msgs.clear();
  return raw;
}

void Omc::clear_messages() {
  std::lock_guard lock(impl_->state_mutex);
  impl_->last_raw.clear();
  impl_->last_msgs.clear();
}

void Omc::on_log(LogFn fn) { impl_->log_fn = std::move(fn); }

OmcState Omc::state() const {
  std::lock_guard lock(impl_->state_mutex);
  return impl_->state;
}
std::string Omc::version() const { return impl_->version; }
void Omc::on_status(StatusFn fn) { impl_->status_fn = std::move(fn); }
std::string Omc::workdir() const { return impl_->workdir.string(); }
std::string Omc::mode() const { return impl_->backend; }
std::string Omc::omc_path(const std::string& host) const { return impl_->to_omc(host); }

std::pair<int, std::string> Omc::script(const std::string& mos, bool network, std::chrono::milliseconds timeout) {
  // its own connection: the session's keeps its lease, and the two never share replies
  const int fd = impl_->open_control();
  const auto close_fd = [fd] { ::close(fd); };
  try {
    std::string body = "cat > /tmp/articula.mos <<'ARTICULA_MOS'\n" + impl_->to_omc(mos) + "\nARTICULA_MOS\nexec omc /tmp/articula.mos";
    json args = {{"runtime", impl_->options.runtime}, {"mode", "exec"}, {"owner", "articula:" + impl_->options.project.string() + ":libraries"},
                 {"command", {"sh", "-c", body}}};
    if (!impl_->options.project.empty()) args["project"] = fs::absolute(impl_->options.project).string();
    if (network) args["policy"] = {{"network", true}};
    const json lease = impl_->control_call(fd, "acquire", args);
    const std::string id = lease.value("id", "");
    int code = -1;
    for (const auto until = Clock::now() + timeout;;) {  // ponytail: polls ps; events when the server subscribes
      bool done = true;
      for (const auto& l : impl_->control_call(fd, "ps", json::object()))
        if (l.value("id", "") == id && l.value("state", "") != "exited" && l.value("state", "") != "failed") done = false;
        else if (l.value("id", "") == id) code = l.value("exit_code", l.value("state", "") == "exited" ? 0 : 1);
      if (done) break;
      if (Clock::now() > until) throw OmcError("the omc script did not finish in time");
      std::this_thread::sleep_for(300ms);
    }
    const std::string text = impl_->control_call(fd, "logs", {{"lease", id}}).value("text", "");
    impl_->control_call(fd, "release", {{"lease", id}});
    close_fd();
    return {code, impl_->from_omc(text)};
  } catch (...) {
    close_fd();
    throw;
  }
}

// --- allow-list ---

const std::vector<std::string>& allowed_calls() {
  static const std::vector<std::string> calls = {
      "loadModel", "loadFile", "getClassNames", "getComponents", "getComponentAnnotations",
      "getNthComponentCondition", "getInheritedClasses", "getClassRestriction", "isConnector",
      "getComponentModifierValue", "getDerivedClassModifierValue", "getIconAnnotation", "getDiagramAnnotation",
      "getConnectionCount", "getNthConnection", "checkModel", "instantiateModel", "addComponent", "deleteComponent", "addConnection",
      "deleteConnection", "setComponentModifierValue", "list", "dumpXMLDAE", "buildModelFMU", "getVersion",
      "getErrorString",  // read-only, how a client words a failed call
      "isPartial", "getSourceFile", "getClassComment", "getDocumentationAnnotation",  // read-only: the library tree, open and Help
      "getComponentModifierNames", "getNthConnectionAnnotation", "getParameterNames", "getParameterValue",  // read-only: the canvas
      "setParameterValue", "setComponentProperties", "updateComponent", "updateConnection"};  // edits, like the rest, of the class named
  return calls;
}

bool allowed(std::string_view expr) {
  const auto& calls = allowed_calls();
  auto listed = [&](std::string_view n) { return std::find(calls.begin(), calls.end(), n) != calls.end(); };
  bool first = true;
  for (std::size_t i = 0; i < expr.size();) {
    const char c = expr[i];
    if (c == '"') {  // a string: skip it, escapes included
      for (++i; i < expr.size() && expr[i] != '"'; ++i)
        if (expr[i] == '\\') ++i;
      if (i >= expr.size()) return false;
      ++i;
      continue;
    }
    if (c == ';' || (c == ':' && i + 1 < expr.size() && expr[i + 1] == '=')) return false;
    if (std::isalpha(static_cast<unsigned char>(c)) || c == '_') {
      const std::size_t start = i;
      while (i < expr.size() && (std::isalnum(static_cast<unsigned char>(expr[i])) || expr[i] == '_' || expr[i] == '.')) ++i;
      const std::string_view ident = expr.substr(start, i - start);
      std::size_t j = i;
      while (j < expr.size() && std::isspace(static_cast<unsigned char>(expr[j]))) ++j;
      const bool is_call = j < expr.size() && expr[j] == '(';
      if (first) {  // the expression is one listed call, unqualified
        if (!is_call || !listed(ident) || start != expr.find_first_not_of(" \t\r\n")) return false;
        first = false;
      } else if (is_call) {
        const std::string_view last = ident.substr(ident.rfind('.') == std::string_view::npos ? 0 : ident.rfind('.') + 1);
        const bool record = !last.empty() && std::isupper(static_cast<unsigned char>(last[0]));
        if (!listed(last) && !record && last != "transformation" && last != "iconTransformation") return false;
        if (!record && ident.find('.') != std::string_view::npos) return false;  // OpenModelica.Scripting.x(…)
      }
      continue;
    }
    ++i;
  }
  return !first;
}

// --- values ---

namespace {

struct Parser {
  std::string_view s;
  std::size_t i = 0;

  void ws() {
    while (i < s.size() && std::isspace(static_cast<unsigned char>(s[i]))) ++i;
  }
  OmValue value() {
    ws();
    OmValue v;
    if (i >= s.size()) throw OmcError("omc answer ended early");
    if (s[i] == '{' || s[i] == '(') {  // lists and tuples alike
      const char close = s[i] == '{' ? '}' : ')';
      v.is_list = true;
      ++i;
      ws();
      if (i < s.size() && s[i] == close) {
        ++i;
        return v;
      }
      for (;;) {
        v.items.push_back(value());
        ws();
        if (i < s.size() && s[i] == ',') {
          ++i;
          continue;
        }
        if (i < s.size() && s[i] == close) {
          ++i;
          return v;
        }
        throw OmcError("malformed omc answer near: " + std::string(s.substr(i, 40)));
      }
    }
    if (s[i] == '"') {
      v.is_string = true;
      for (++i; i < s.size() && s[i] != '"'; ++i) {
        if (s[i] == '\\' && i + 1 < s.size()) {
          const char e = s[++i];
          v.atom += e == 'n' ? '\n' : e == 't' ? '\t' : e;
        } else {
          v.atom += s[i];
        }
      }
      if (i >= s.size()) throw OmcError("unterminated string in omc answer");
      ++i;
      return v;
    }
    // An atom runs to the next separator at this depth; it may hold parentheses itself
    // (a record value such as Placement(…)), kept as written.
    int depth = 0;
    const std::size_t start = i;
    for (; i < s.size(); ++i) {
      const char c = s[i];
      if (c == '"') {
        for (++i; i < s.size() && s[i] != '"'; ++i)
          if (s[i] == '\\') ++i;
      } else if (c == '(' || c == '{') {
        ++depth;
      } else if (c == ')' || c == '}') {
        if (depth == 0) break;
        --depth;
      } else if (c == ',' && depth == 0) {
        break;
      }
    }
    v.atom = trim(std::string(s.substr(start, i - start)));
    return v;
  }
};

}  // namespace

OmValue parse_value(std::string_view text) {
  Parser p{text};
  OmValue v = p.value();
  p.ws();
  if (p.i != text.size()) throw OmcError("trailing text in omc answer: " + std::string(text.substr(p.i, 40)));
  return v;
}

std::string quote(std::string_view text) {
  std::string out = "\"";
  for (const char c : text) {
    if (c == '"' || c == '\\') out += '\\';
    out += c;
  }
  return out + '"';
}

}  // namespace articula
