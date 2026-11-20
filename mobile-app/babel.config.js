const fs = require("fs");
const path = require("path");

try {
  const envFile = fs.readFileSync(path.resolve(__dirname, ".env"), "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
} catch (_) {}

function inlineExpoPublicEnvPlugin({ types: t }) {
  return {
    name: "inline-expo-public-env",
    visitor: {
      MemberExpression(nodePath) {
        const { object, property, computed } = nodePath.node;
        if (
          t.isMemberExpression(object) &&
          t.isIdentifier(object.object, { name: "process" }) &&
          t.isIdentifier(object.property, { name: "env" })
        ) {
          const key =
            computed && t.isStringLiteral(property)
              ? property.value
              : !computed && t.isIdentifier(property)
              ? property.name
              : null;
          if (key && key.startsWith("EXPO_PUBLIC_")) {
            const val = process.env[key];
            nodePath.replaceWith(
              val !== undefined ? t.stringLiteral(String(val)) : t.identifier("undefined")
            );
          }
        }
      },
    },
  };
}

module.exports = function (api) {
  const isProd = api.env("production") || process.env.NODE_ENV === "production";
  api.cache(() => isProd);
  return {
    presets: [
      "babel-preset-expo",
      "nativewind/babel",
    ],
    plugins: [
      inlineExpoPublicEnvPlugin,
      ...(isProd ? [["transform-remove-console", { exclude: ["error"] }]] : []),
      "react-native-reanimated/plugin",
    ],
  };
};
