# One line per xcodebuild step (compile, link, script, gradle), errors and warnings, from xcodebuild's full output.
# Shared by ios.sh (simulator) and ios-device.sh (a connected iPhone).
  function target() { return match($0, /in target .[^']+/) ? substr($0, RSTART + 11, RLENGTH - 11) : "" }
  function file(path) { n = split(path, parts, "/"); return parts[n] }
  function say(s) { print s; fflush() }
  failed && /^\(/ { failed = 0 }
  failed { say("  " $0); next }
  /^The following build commands failed:/ { failed = 1; say($0); next }
  /^(Resolve Package Graph|Fetching from|Cloning |Creating working copy|Checking out|Compile plug-in)/ { say($0); next }
  /^(SwiftCompile|CompileC) / { for (i = 1; i <= NF; i++) if ($i ~ /\.(swift|c|m|mm|cpp)$/) f = file($i); say("compile  " f "  (" target() ")"); next }
  /^Ld / { say("link     " target()); next }
  /^PhaseScriptExecution / { say("script   " target() ": " substr($0, 22, index($0, " /") - 22)); next }
  /^> Task .* (UP-TO-DATE|NO-SOURCE|SKIPPED|FROM-CACHE)$/ { next }
  /^> Task / { say("gradle   " substr($0, 8)); next }
  /^(e: |FAILURE:|\* What went wrong:)/ { say($0); wrong = ($0 ~ /What went wrong/); next }
  wrong { say($0); wrong = 0; next }
  / error: / { say($0); next }
  / warning: / && !/SourcePackages/ { say($0); next }
  /^\*\* BUILD/ { say($0); next }
