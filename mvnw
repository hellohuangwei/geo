#!/bin/sh
# Maven Wrapper script
MAVEN_PROJECTBASEDIR=$(dirname "$(readlink -f "$0")")
export MAVEN_PROJECTBASEDIR
exec "$JAVA_HOME/bin/java" \
  -classpath "$MAVEN_PROJECTBASEDIR/.mvn/wrapper/maven-wrapper.jar" \
  -Dmaven.multiModuleProjectDirectory="$MAVEN_PROJECTBASEDIR" \
  org.apache.maven.wrapper.MavenWrapperMain "$@"
