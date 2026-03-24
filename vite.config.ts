import { defineConfig } from "vite";
import { resolve } from "path";
import { readFileSync } from "fs";

const { version } = JSON.parse(readFileSync("jsr.json", "utf-8"));

export default defineConfig({
	root: "demo",
	resolve: {
		alias: {
			"@lgtm/digimatic-js": resolve(import.meta.dirname, "src/index.ts"),
		},
	},
	define: {
		__LIB_VERSION__: JSON.stringify(version),
	},
});
