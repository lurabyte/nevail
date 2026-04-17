cmake_minimum_required(VERSION 3.27.4)
project(launch-app)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(CMAKE_${lang}_COMPILE_OPTIONS_SYSROOT "--sysroot=")

# Source files
file(GLOB_RECURSE sources src/*.cpp src/*.hpp src/*.h)

# Find Boost - required for process management and IPC
find_package(Boost REQUIRED COMPONENTS system thread)

add_executable(launch-app ${sources})

target_compile_options(launch-app PRIVATE -std=c++17 -Wall -Wextra -Wno-deprecated-declarations -Wno-unused-parameter)
target_compile_definitions(launch-app PRIVATE
  APPLICATION_NAME=${APPLICATION_NAME}
  SHOULD_OPEN_IN_DEFAULT_BROWSER=${SHOULD_OPEN_IN_DEFAULT_BROWSER}
  SHOULD_RUN_IN_BACKGROUND=${SHOULD_RUN_IN_BACKGROUND}
)

target_include_directories(launch-app PRIVATE ${Boost_INCLUDE_DIRS})

# Platform-specific configuration
if(${CMAKE_SYSTEM_NAME} MATCHES "Darwin")
  # macOS
  target_link_libraries(launch-app PRIVATE ${Boost_SYSTEM_LIBRARY} ${Boost_THREAD_LIBRARY})
elseif(UNIX AND NOT APPLE)
  # Linux
  find_package(PkgConfig REQUIRED)
  pkg_check_modules(APPINDICATOR REQUIRED appindicator3-0.1)

  target_include_directories(launch-app PRIVATE ${APPINDICATOR_INCLUDE_DIRS})
  target_link_libraries(launch-app PRIVATE
    ${Boost_SYSTEM_LIBRARY}
    ${Boost_THREAD_LIBRARY}
    dl
    ${APPINDICATOR_LIBRARIES}
  )
elseif(WIN32)
  # Windows
  target_link_libraries(launch-app PRIVATE
    ${Boost_SYSTEM_LIBRARY}
    ${Boost_THREAD_LIBRARY}
    ws2_32
  )
endif()
