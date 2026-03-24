import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
	root: "demo",
	resolve: {
		alias: {
			"@lgtm/digimatic-js": resolve(import.meta.dirname, "src/index.ts"),
		},
	},
});
