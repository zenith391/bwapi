/**
 * bwapi - Blocksworld API server reimplementation
 * Copyright (C) 2020 zenith391
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import fs from "fs";
import multiparty from "multiparty";
import bodyParser from "body-parser";
import express, { Express, Request, Response } from "express";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { BWRequest, getAuthToken } from "./util.js";
import { migrateOldFiles } from "./analytics.js";

import { User } from "./users.js";
import config from "./config.js";

(global as any).__filename = fileURLToPath(import.meta.url);
(global as any).__dirname = path.dirname(__filename);

// TODO: remove the following (global as any) declarations
(global as any).HOST = config.HOST;
(global as any).ROOT_NAME = config.ROOT_NAME;
(global as any).EARLY_ACCESS = config.EARLY_ACCESS;
(global as any).VERSION = config.VERSION;
(global as any).MAX_WORLD_LIMIT = config.MAX_WORLD_LIMIT;

(global as any).authTokens = {};
(global as any).capabilities = {
  bwapi: {
    version: config.VERSION,
  },
}; // for modded

const fileOptions = {
  root: __dirname,
};

const db = await open({
  filename: config.DATABASE_PATH,
  driver: sqlite3.cached.Database,
});
await db.run(
  `PRAGMA journal_mode = wal;
  PRAGMA foreign_keys = on;`,
);
await db.migrate({});

const app: Express = express();

// Utility Functions //

// Get the auth token from a request object
(global as any).getAuthToken = function (req: Request): string | undefined {
  const authToken = req.headers["bw-auth-token"];
  return authToken as string | undefined;
};

// just internally used helper functions
(global as any).value2 = function (v: any): any {
  if (typeof v == "object") {
    return v[0];
  } else {
    return v;
  }
};

// Internally used
(global as any).value = function (body: any, name: string): any {
  let v = body[name];
  if (typeof v == "object") {
    return v[0];
  } else {
    return v;
  }
};

// Function used to validate an user's auth token and get to whom it belongs.
(global as any).validAuthToken = function (
  req: Request,
  res: Response,
  bodyCheck: boolean,
): { ok: boolean; user?: User; authToken?: string } {
  let authToken = (global as any).getAuthToken(req);
  if (authToken === undefined) {
    res.status(405).json({
      error: 405,
      error_msg: "missing authentication token",
    });
    return { ok: false };
  }
  let userId = (global as any).authTokens[authToken];
  if (userId === undefined) {
    console.warn(
      "vat: User has auth token " +
        authToken +
        " but no user ID is associated to it.",
    );
  }
  if (userId == undefined) {
    res.status(405).json({
      error: 405,
      error_msg: "unauthentificated user",
    });
    return { ok: false };
  }
  if (bodyCheck && (req.body == undefined || req.body == null)) {
    res.status(400).json({
      error: "no body",
    });
    return { ok: false };
  }
  return {
    ok: true,
    user: new User(userId),
    authToken: authToken,
  };
};

// Helper function for ISO date formatting
function datePart(num: number): string {
  let str = num.toString();
  if (str.length < 2) {
    str = "0" + str;
  }
  return str;
}

// Format a 'Date' object in ISO format.
(global as any).dateString = function (date?: Date): string {
  if (date === undefined || date === null) {
    date = new Date(); // default to current date
  }
  let currDateStr =
    date.getUTCFullYear() +
    "-" +
    datePart(date.getUTCMonth() + 1) +
    "-" +
    datePart(date.getUTCDate()) +
    "T" +
    datePart(date.getUTCHours()) +
    ":" +
    datePart(date.getUTCMinutes()) +
    ":" +
    datePart(date.getSeconds()) +
    "+00:00";
  return currDateStr;
};

app.use(compression());

app.use((express_req: Request, res: Response, next: () => void) => {
  const req = express_req as BWRequest;
  // Log queries
  let authToken = getAuthToken(req);
  let userId: string | undefined = undefined;
  if (authToken !== undefined) {
    userId = (global as any).authTokens[authToken];
    if (userId === undefined) {
      console.warn(
        "User has auth token " +
          authToken +
          " but no user ID is associated to it.",
      );
    }
  }
  console.debug(req.method + " " + req.url, userId);

  req.db = db;
  res.set("Server", "BWAPI 0.9.1");
  res.set("Access-Control-Allow-Origin", "*"); // allows client JavaScript code to access bwapi
  try {
    next();
  } catch (e: any) {
    console.error("Request failed (" + req.url + ")");
    console.error("Error name: " + e.name);
    console.error("Error message: " + e.message);
    console.error(e.stack);
  }
});

app.disable("x-powered-by");

app.use(function (req: Request, res: Response, next: () => void) {
  if (req.headers["content-type"] != undefined) {
    if (req.headers["content-type"].indexOf("multipart/form-data") != -1) {
      // The request is in HTTP form data which the 'multiparty' package can parse.
      let form = new multiparty.Form();
      (form as any).maxFieldsSize = 1024 * 1024 * 16; // 16 MiB
      form.parse(req, function (err: any, fields: any, files: any) {
        if (err) {
          console.error(err);
        }
        req.body = fields;
        (req as any).files = files;
        next();
      });
    } else if (req.headers["content-type"].indexOf("application/json") != -1) {
      // The request is in JSON format which 'bodyParser' package can parse.
      bodyParser.json({ limit: "50mb" })(req, res, next);
    } else if (
      req.headers["content-type"].indexOf(
        "application/x-www-form-urlencoded",
      ) != -1
    ) {
      // The request is URL-encoded which 'bodyParser' package can parse.
      (req as any).files = {};
      bodyParser.urlencoded({ extended: false, limit: "50mb" })(req, res, next);
    } else {
      next();
    }
  } else {
    next();
  }
});

// Init every modules
let cores = fs.readdirSync("modules");
for (const i in cores) {
  let file = cores[i];
  if (file != "app.js") {
    const userModule = await import("./" + file);
    if (userModule.run) {
      console.debug("Init module " + file);
      userModule.run(app, db);
    }
  }
}

await migrateOldFiles(db);

// Plain file hosting //

// Minify files at start of the program so they don't have to be minified each time.
const steamRemoteConf = JSON.stringify(
  JSON.parse(
    fs.readFileSync("conf/steam_app_remote_configuration.json", {
      encoding: "utf-8",
    }),
  ),
);

app.get(
  "/api/v1/steam-app-remote-configuration",
  function (req: Request, res: Response) {
    res.status(200).send(steamRemoteConf);
  },
);

const iosRemoteConf = JSON.parse(
  fs.readFileSync("conf/app_remote_configuration.json", {
    encoding: "utf-8",
  }),
);
app.get(
  "/api/v1/app-remote-configuration",
  function (req: Request, res: Response) {
    res.status(200).json(iosRemoteConf);
  },
);

let contentCategories = JSON.stringify(
  JSON.parse(
    fs.readFileSync("conf/content_categories.json", {
      encoding: "utf-8",
    }),
  ),
);
app.get(
  "/api/v1/content-categories-no-ip",
  function (req: Request, res: Response) {
    res.status(200).send(contentCategories);
  },
);
app.get("/api/v1/content-categories", function (req: Request, res: Response) {
  res.status(200).send(contentCategories);
});

let blocksPricings = JSON.stringify(
  JSON.parse(
    fs.readFileSync("conf/blocks_pricings.json", {
      encoding: "utf-8",
    }),
  ),
);
app.get("/api/v1/block_items/pricing", function (req: Request, res: Response) {
  res.status(200).send(blocksPricings);
});

let coinPacks = JSON.stringify(
  JSON.parse(
    fs.readFileSync("conf/coin_packs.json", {
      encoding: "utf-8",
    }),
  ),
);
app.get("/api/v1/store/coin_packs", function (req: Request, res: Response) {
  res.status(200).send(coinPacks);
});

app.use(
  "/images",
  express.static("images", { extensions: ["png", "jpg"], maxAge: "5m" }),
); // Serve the 'images' folder

// Default handler that only acts if a non-existent endpoint is requested
app.all("/api/v1/*", function (req: Request, res: Response) {
  res.status(404).json({
    error: "404",
    error_msg: "Not Found",
    error_details: "This API endpoint has no route handler.",
  });
});

// /api/v2 is an API dedicated to mods.
app.all("/api/v2/*", function (req: Request, res: Response) {
  res.status(404).json({
    error: "404",
    error_msg: "Missing or invalid API endpoint",
    error_details: "The API endpoint is missing from the URL or is invalid.",
  });
});

// Mimics BW1 behaviour by sending 'Forbidden' HTTP status code on every URL not starting by /api/v1/ (and by /api/v2/)
app.all("*", function (req: Request, res: Response) {
  res.set("Content-Type", "text/plain");
  res.status(403).send("Forbidden");
});

export default app;
