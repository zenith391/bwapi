import { dirname } from "path";
import { fileURLToPath } from "url";

// you *MUST* change this to the address of your server (otherwise some features like thumbnails won't work) !
const Config = {
  HOST: "https://bwsecondary.ddns.net:8080",
  ROOT_NAME: dirname(fileURLToPath(import.meta.url)),
  EARLY_ACCESS: true,
  VERSION: "0.9.3",
  /// How many worlds each player can have
  MAX_WORLD_LIMIT: 200,
};

export default Config;
