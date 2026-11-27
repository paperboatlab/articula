cmake_minimum_required(VERSION 3.25)
project(articula VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

option(ARTICULA_BUILD_TESTS "Build Catch2 tests" ON)

include(FetchContent)
FetchContent_Declare(nlohmann_json
  URL https://github.com/nlohmann/json/releases/download/v3.12.0/json.tar.xz
  FIND_PACKAGE_ARGS 3.11)
FetchContent_Declare(tomlplusplus
  URL https://github.com/marzer/tomlplusplus/archive/refs/tags/v3.4.0.tar.gz
  FIND_PACKAGE_ARGS 3.4)

set(USE_TLS OFF CACHE BOOL "" FORCE)
set(USE_ZLIB OFF CACHE BOOL "" FORCE)
set(IXWEBSOCKET_INSTALL OFF CACHE BOOL "" FORCE)
FetchContent_Declare(ixwebsocket SYSTEM
  URL https://github.com/machinezone/IXWebSocket/archive/refs/tags/v12.1.0.tar.gz)

FetchContent_MakeAvailable(nlohmann_json tomlplusplus ixwebsocket)

add_library(articula_warnings INTERFACE)
if(MSVC)
  target_compile_options(articula_warnings INTERFACE /W4 /permissive-)
else()
  target_compile_options(articula_warnings INTERFACE -Wall -Wextra -Wpedantic -Wshadow -Wconversion)
endif()

add_library(articula_lib
  src/omc.cpp
  src/connectors.cpp
  src/icon.cpp
  src/seticon.cpp
  src/generate.cpp
  src/server.cpp
)
target_include_directories(articula_lib PUBLIC include)
target_link_libraries(articula_lib
  PUBLIC nlohmann_json::nlohmann_json
  PRIVATE ixwebsocket tomlplusplus::tomlplusplus articula_warnings ${CMAKE_DL_LIBS}
)
if(WIN32)
  # processes, LoadLibrary and the environment on Windows; the POSIX code stays in place
  target_sources(articula_lib PRIVATE src/win32.cpp)
  target_link_libraries(articula_lib PRIVATE ws2_32)
  # std::getenv and friends: the server reads, never keeps, what they return
  target_compile_definitions(articula_lib PRIVATE _CRT_SECURE_NO_WARNINGS)
endif()

add_executable(articula-server src/main.cpp)
target_compile_definitions(articula-server PRIVATE ARTICULA_VERSION="${PROJECT_VERSION}")
target_link_libraries(articula-server PRIVATE articula_lib articula_warnings)

# Install or copy binary to bin/
install(TARGETS articula-server RUNTIME DESTINATION bin)

if(ARTICULA_BUILD_TESTS)
  enable_testing()
  FetchContent_Declare(Catch2
    URL https://github.com/catchorg/Catch2/archive/refs/tags/v3.16.1.tar.gz
    FIND_PACKAGE_ARGS 3)
  FetchContent_MakeAvailable(Catch2)

  add_executable(articula_tests tests/modelica_test.cpp)
  target_compile_definitions(articula_tests PRIVATE
    ARTICULA_TEST_DATA="${CMAKE_CURRENT_SOURCE_DIR}/tests/data"
    PAPERBOAT_TEST_DATA="${CMAKE_CURRENT_SOURCE_DIR}/tests/data"
    ARTICULA_SERVER_BIN="$<TARGET_FILE:articula-server>")
  add_dependencies(articula_tests articula-server)
  target_link_libraries(articula_tests PRIVATE articula_lib tomlplusplus::tomlplusplus Catch2::Catch2WithMain articula_warnings)
  include(Catch)
  catch_discover_tests(articula_tests)
endif()
