#pragma once

// The OpenModelica compiler as a long-lived session: the `omc` runtime's session mode, leased from
// paperboatd (paperboat/docs/control.md) and spoken to in paperboat-runtime/0 (`eval` per expression).
// The workspace is the lease's project; host paths in an expression become the paths omc sees
// (/work/project, /work/out, /work/deps) and come back as host paths in its answer. One request in
// flight at a time; a request that times out or finds omc gone starts a new session (replaying the
// libraries and files it had loaded), and after 3 restarts in a row the bridge is `failed`.

#include <chrono>
#include <filesystem>
#include <functional>
#include <memory>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace articula {

struct OmcError : std::runtime_error {
  using std::runtime_error::runtime_error;
};

enum class OmcState { Ready, Checking, Failed };
std::string_view name(OmcState state);  // "ready", "checking", "failed"

/** One of omc's messages, split into the level, the prose and the source span omc gave. */
struct OmcMessage {
  std::string level;   // error | warning | info
  std::string text;
  std::string file;
  int line = 0;
  int column = 0;
};

class Omc {
 public:
  struct Options {
    std::string runtime = "omc@1.27";                 // the paperboatd runtime
    std::filesystem::path project = {};               // the workspace: mounted for omc, writable
    bool writable_project = true;                     // false: read-only (an example opened in place)
    std::chrono::milliseconds timeout{30'000};        // per request
    int max_restarts = 3;                             // in a row, then failed
  };
  using StatusFn = std::function<void(OmcState, const std::string& version)>;
  using LogFn = std::function<void(const OmcMessage&)>;

  Omc();
  explicit Omc(Options options);
  ~Omc();
  Omc(const Omc&) = delete;
  Omc& operator=(const Omc&) = delete;

  /** Release omc now, without waiting for the destructor (SIGTERM/SIGINT). */
  void shutdown();
  /** Work in another folder (empty: none): the session ends, and the next call starts one on the new
      project, loading again the libraries the old one had (not its files: they aren't in the new one).
      `writable` false mounts it read-only (an example, paperboat#75): omc writes only its work folder. */
  void set_project(const std::filesystem::path& project, bool writable = true);
  /** End the call in flight (a long simulate): it fails with "cancelled", and the next call
      starts a new session. Safe from any thread. */
  void cancel();

  // Evaluates one omc expression, e.g. `checkModel(M)`, and returns omc's answer as text
  // (`true`, `"…"`, `{…}`), without the trailing newline. Starts omc on first use. Throws
  // OmcError when omc can't start, or failed (OmcState::Failed).
  std::string call(std::string_view expr);
  std::string call(std::string_view expr, std::chrono::milliseconds timeout);

  // `getErrorString()` unquoted: what omc said about the calls since the last one. Drains omc's
  // buffer, so it is also what the log callback hears.
  std::string errors();

  // Drains omc's messages and returns them split by level and source. The same list is kept for
  // `last_messages()` and read by `getErrorString()` clients.
  std::vector<OmcMessage> messages();
  // The messages from the last drain, without asking omc again.
  std::vector<OmcMessage> last_messages() const;
  // `getErrorString()` as the last drain saw it; clears the cache (a client's read).
  std::string take_errors();
  // Forgets the last drain, so a new operation starts with a clean read.
  void clear_messages();

  OmcState state() const;
  std::string version() const;  // "OpenModelica 1.27…" once started, else ""
  // Called (from the calling thread) on every state change.
  void on_status(StatusFn fn);
  // Called for each drained message, in order, so a server can stream omc's log.
  void on_log(LogFn fn);

  // The folder omc runs in, as the host sees it (the lease's work folder: builds, results, dumps).
  std::string workdir() const;
  // Runs a .mos script in a short omc of its own (an exec lease on the same project and package volume),
  // with the network for that step when asked (installing libraries): {exit code, its output}.
  std::pair<int, std::string> script(const std::string& mos, bool network, std::chrono::milliseconds timeout);
  // A host path as omc sees it (/work/out/… in a container; the same path natively).
  std::string omc_path(const std::string& host) const;
  // Where omc runs: the lease's backend, "podman", "docker" or "native".
  std::string mode() const;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

// Whether `expr` may come from a Studio client over articula/0: one call to a function on the
// allow-list (contracts §5), whose nested calls are allow-listed too or are annotation
// records (capitalised: Placement(…), Line(…)) or their `transformation`s. No `;`, no `:=`.
bool allowed(std::string_view expr);
const std::vector<std::string>& allowed_calls();

// omc's answers, parsed: `{a, "b", {c}}` → a list of atoms and lists. Strings keep their
// unescaped text; other atoms their spelling (`true`, `1.5`, `Modelica.Blocks`).
struct OmValue {
  bool is_list = false;
  bool is_string = false;
  std::string atom;
  std::vector<OmValue> items;

  const OmValue& operator[](std::size_t i) const { return items.at(i); }
  std::size_t size() const { return items.size(); }
};
OmValue parse_value(std::string_view text);  // throws OmcError on malformed text
std::string quote(std::string_view text);    // a Modelica string literal

// A class inside a package needs its package loaded first: omc's loadFile on a file with
// `within Pkg.Sub` fails when Pkg is not there. Loads the outermost package.mo above `file` (once per
// process unless `force`); a file outside any package loads nothing. Throws OmcError.
void load_packages(Omc& omc, const std::filesystem::path& file, bool force = false);
// load_packages, then `file` itself (reloading the package once if omc restarted). Throws OmcError.
void load_class_file(Omc& omc, const std::filesystem::path& file);
// The class `file` defines among the loaded user classes (`Pkg.Sub.B` too), or "" when none does.
std::string class_in_file(Omc& omc, const std::filesystem::path& file);

}  // namespace articula

namespace paperboat::modelica {
using namespace articula;
}

