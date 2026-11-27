#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <map>
#include <sstream>
#include <set>
#include <string>
#include <string_view>
#include <vector>

#include <nlohmann/json.hpp>

#include "articula/generate.hpp"
#include "articula/import.hpp"
#include "articula/omc.hpp"
#include "articula/server.hpp"

namespace fs = std::filesystem;
namespace mo = articula;

#ifndef ARTICULA_VERSION
#define ARTICULA_VERSION "0.1.0"
#endif

namespace {

void print_help(std::string_view prog) {
  std::cout << "Articula (" << ARTICULA_VERSION << "): Modelica editor server & tools\n\n"
            << "Usage:\n"
            << "  " << prog << " [<folder>|Model.mo] [options]        The editor: articula/0 server and web app\n"
            << "  " << prog << " generate <Model.mo> [options]        Make a Paperboat station from Modelica\n"
            << "  " << prog << " check <Model.mo> [--model <Name>]    omc's checkModel on Modelica model\n"
            << "  " << prog << " icon <Model.mo|Name> [--class <Name>] Import icon & connectors as JSON\n"
            << "  " << prog << " export <Model.mo> --model <Name> --as <kind> [--out <file>] [options]\n"
            << "                   kind: station | linear-station | linear | fmu | flat | equations\n"
            << "                   --set a=1,b=2 (the operating point)  --at <s>  --lang julia|python|matlab|modelica\n"
            << "                   --fmi 2.0|3.0  --type cs|me  --solver cvode|euler  --stage flat|optimiser|backEnd  --path auto|ode|fmu  --replace\n"
            << "\nomc runs as Paperboat's omc runtime (paperboat runtime list); Modelica libraries are its\n"
            << "packages: paperboat package add omc Modelica --project <folder>\n\n"
            << "  " << prog << " --help | --version\n"
            << "Server options:\n"
            << "  --port <N>       Listen port (default: 30472, else first free of 30500..30599)\n"
            << "  --app <dir>      Directory of built web app (default: ./dist)\n"
            << "  --version <V>    Target version tag\n\n"
            << "Generate options:\n"
            << "  --model <Name>   Qualified Modelica model name inside file\n"
            << "  --out <dir>      Output station directory (default: <model>-cpp/)\n"
            << "  --path <path>    ode | fmu | auto (default: auto)\n";
}

// omc sees only the lease's project: the folder holding `path` (a top package's parent for a package).
mo::Omc::Options around(const fs::path& path) {
  return {.project = mo::workspace_of(fs::absolute(path))};
}

int cmd_icon(const std::vector<std::string_view>& args) {
  if (args.empty()) {
    std::cerr << "error: icon requires a file (.mo) or a qualified Modelica class name\n";
    return 2;
  }
  const std::string_view target = args[0];
  std::string cls;
  for (std::size_t i = 1; i < args.size(); ++i) {
    const auto flag = args[i];
    if (flag == "--json") continue;
    if (i + 1 >= args.size()) {
      std::cerr << "error: " << flag << " needs a value\n";
      return 2;
    }
    const std::string value(args[++i]);
    if (flag == "--class" || flag == "--model") cls = value;
    else {
      std::cerr << "error: unknown option " << flag << '\n';
      return 2;
    }
  }
  try {
    const bool is_file = fs::is_regular_file(target) || target.ends_with(".mo") ||
                         target.find('/') != std::string_view::npos || target.find('\\') != std::string_view::npos;
    mo::Omc omc(is_file ? around(fs::path(target)) : mo::Omc::Options{});
    const mo::ImportedModel imp = is_file ? mo::import_model(omc, fs::path(target), cls)
                                          : mo::import_model(omc, {}, cls.empty() ? target : std::string_view(cls));
    std::cout << imp.to_json().dump(2) << '\n';
    return 0;
  } catch (const std::exception& e) {
    std::cerr << "error: " << e.what() << '\n';
    return 1;
  }
}

int cmd_check_or_generate(std::string_view action, const std::vector<std::string_view>& args) {
  if (args.empty()) {
    std::cerr << "error: " << action << " requires a Modelica source file (.mo)\n";
    return 2;
  }
  if (args[0] == "--help" || args[0] == "-h") {
    print_help("articula");
    return 0;
  }
  mo::GenerateOptions o{.source = std::string(args[0])};
  for (std::size_t i = 1; i < args.size(); ++i) {
    const auto flag = args[i];
    if (flag == "--help" || flag == "-h") {
      print_help("articula");
      return 0;
    }
    if (i + 1 >= args.size()) {
      std::cerr << "error: " << flag << " needs a value\n";
      return 2;
    }
    const std::string value(args[++i]);
    if (flag == "--model" || flag == "-m") o.model = value;
    else if (flag == "--out" || flag == "-o") o.out = value;
    else if (flag == "--path" || flag == "-p") o.path = value;
    else {
      std::cerr << "error: unknown option " << flag << '\n';
      return 2;
    }
  }
  try {
    mo::Omc omc(around(o.source));
    if (action == "check") {
      const auto r = mo::check(omc, o.source, o.model);
      (r.ok ? std::cout : std::cerr) << r.message << '\n';
      return r.ok ? 0 : 1;
    }
    const auto r = mo::generate(omc, o);
    std::cout << r.model << " -> " << r.out.string() << "/ (" << r.reason << ")\n";
    for (const auto& n : r.notices) std::cout << "  note: " << n << '\n';
    for (const auto& f : r.written) std::cout << "  wrote " << f.string() << '\n';
    std::cout << "next: paperboat build " << r.out.string() << " && paperboat run " << r.out.string() << '\n';
    return 0;
  } catch (const std::exception& e) {
    std::cerr << "error: " << e.what() << '\n';
    return 1;
  }
}

// `articula export`: the app's Export as ▸, from a terminal (the dialog shows the same line).
int cmd_export(const std::vector<std::string_view>& args) {
  if (args.empty() || args[0] == "--help" || args[0] == "-h") {
    std::cerr << "usage: articula export <Model.mo> --model <Name> --as <kind> [--out <file>] (articula help)\n";
    return 2;
  }
  const fs::path source = fs::absolute(std::string(args[0]));
  nlohmann::json in{{"source", source.string()}, {"set", nlohmann::json::object()}};
  static const std::map<std::string_view, const char*> flag{{"--model", "model"}, {"--as", "kind"}, {"--out", "out"}, {"--lang", "lang"},
      {"--fmi", "fmi"}, {"--type", "fmuType"}, {"--solver", "fmu_solver"}, {"--stage", "stage"}, {"--path", "path"}};
  for (std::size_t i = 1; i < args.size(); ++i) {
    if (args[i] == "--replace") {
      in["replace"] = true;
      continue;
    }
    if (i + 1 >= args.size()) {
      std::cerr << "error: " << args[i] << " needs a value\n";
      return 2;
    }
    const std::string value(args[i + 1]);
    if (args[i] == "--set") {
      std::stringstream all(value);
      for (std::string kv; std::getline(all, kv, ',');) {
        const auto eq = kv.find('=');
        if (eq == std::string::npos) { std::cerr << "error: --set takes name=number\n"; return 2; }
        in["set"][kv.substr(0, eq)] = kv.substr(eq + 1);
      }
    } else if (args[i] == "--at") {
      in["at"] = std::stod(value);
    } else if (flag.contains(args[i])) {
      in[flag.at(args[i])] = value;
    } else {
      std::cerr << "error: unknown option " << args[i] << '\n';
      return 2;
    }
    ++i;
  }
  const std::string model = in.value("model", ""), kind = in.value("kind", "");
  if (model.empty() || kind.empty()) {
    std::cerr << "error: export needs --model and --as\n";
    return 2;
  }
  if (!in.contains("out")) {
    static const std::map<std::string, std::string> ext{{"station", ".pst"}, {"linear-station", ".pst"}, {"fmu", ".fmu"}, {"flat", ".flat.mo"}, {"equations", ".xml"}};
    const std::map<std::string, std::string> lang{{"julia", ".jl"}, {"python", ".py"}, {"matlab", ".m"}, {"modelica", ".mo"}};
    const std::string stem = model.substr(model.rfind('.') == std::string::npos ? 0 : model.rfind('.') + 1);
    in["out"] = stem + (kind == "linear" ? lang.at(in.value("lang", "julia")) : ext.contains(kind) ? ext.at(kind) : "");
  }
  try {
    mo::Omc omc(around(source));
    omc.call("loadModel(Modelica)");
    if (omc.call("loadFile(" + mo::quote(omc.omc_path(source.string())) + ")") != "true") throw std::runtime_error(omc.errors());
    const auto r = mo::transfer_export(omc, in, fs::current_path(), false);
    if (r.contains("exists")) {
      std::cerr << "error: " << r["exists"].get<std::string>() << " is there already (--replace writes over it)\n";
      return 1;
    }
    std::cout << "wrote " << r.value("path", std::string()) << " (" << r.value("bytes", 0) << " bytes)\n";
    for (const auto& n : r["notes"]) if (!n.get<std::string>().empty()) std::cout << "  " << n.get<std::string>() << '\n';
    return 0;
  } catch (const std::exception& e) {
    std::cerr << "error: " << e.what() << '\n';
    return 1;
  }
}

fs::path find_app_dir(const fs::path& explicit_app, const fs::path& exe_dir) {
  if (!explicit_app.empty()) return explicit_app;
  std::error_code ec;
  for (const auto& cand : {
           exe_dir / "dist",
           exe_dir.parent_path() / "dist",
           exe_dir.parent_path().parent_path() / "dist",
           fs::current_path() / "dist",
       }) {
    if (fs::is_regular_file(cand / "index.html", ec)) return cand;
  }
  return {};
}

int cmd_server(const std::vector<std::string_view>& args, const fs::path& exe_dir) {
  int port = 0;  // 0: 30472, else first free of 30500..30599
  fs::path app;
  fs::path file;
  for (std::size_t i = 0; i < args.size(); ++i) {
    if (args[i] == "--port" && i + 1 < args.size()) {
      port = std::stoi(std::string(args[++i]));
    } else if (args[i] == "--app" && i + 1 < args.size()) {
      app = std::string(args[++i]);
    } else if (args[i] == "--version" && i + 1 < args.size()) {
      ++i;  // Ignored in direct server mode
    } else if (i == 0 && (args[i] == "start" || args[i] == "run")) {
      continue;
    } else if (!args[i].starts_with("--")) {
      file = std::string(args[i]);
    }
  }

  app = find_app_dir(app, exe_dir);
  if (app.empty()) {
    std::cerr << "note: Studio dist/ not found; serving articula/0 only\n";
  }

  return mo::serve_articula(port, app, {}, file);
}

}  // namespace

int main(int argc, char** argv) {
  std::vector<std::string_view> args;
  for (int i = 1; i < argc; ++i) args.emplace_back(argv[i]);

  const fs::path exe_dir = fs::weakly_canonical(fs::path(argv[0])).parent_path();

  // bin/articula always passes `--app <dist>` first; a command after it is still that command (#46),
  // and only the server reads --app.
  static const std::set<std::string_view> commands{"help", "--help", "-h", "--version", "-v", "generate", "check", "export", "icon"};
  if (args.size() >= 3 && args[0] == "--app" && commands.contains(args[2])) args.erase(args.begin(), args.begin() + 2);

  if (!args.empty()) {
    if (args[0] == "--help" || args[0] == "-h" || args[0] == "help") {
      print_help(argv[0]);
      return 0;
    }
    if (args[0] == "--version" || args[0] == "-v") {
      std::cout << "articula " << ARTICULA_VERSION << '\n';
      return 0;
    }
    if (args[0] == "generate" || args[0] == "check") {
      std::vector<std::string_view> sub_args(args.begin() + 1, args.end());
      return cmd_check_or_generate(args[0], sub_args);
    }
    if (args[0] == "export") return cmd_export(std::vector<std::string_view>(args.begin() + 1, args.end()));
    if (args[0] == "icon") {
      std::vector<std::string_view> sub_args(args.begin() + 1, args.end());
      return cmd_icon(sub_args);
    }
  }

  return cmd_server(args, exe_dir);
}
