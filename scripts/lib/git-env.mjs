/** Repository selection must come from the explicit cwd, even inside Git hooks. */
export function gitEnv(env = process.env) {
  const clean = { ...env };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_PREFIX", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_NAMESPACE"]) delete clean[key];
  return clean;
}
