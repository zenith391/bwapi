import { dirname } from "path";
import { fileURLToPath } from "url";

const Config = {
	HOST: "https://bwsecondary.ddns.net:8080/",
	ROOT_NAME: dirname(fileURLToPath(import.meta.url)),
	EARLY_ACCESS: true,
	VERSION: "0.9.2",
	MAX_WORLD_LIMIT: 200
};

export default Config;
