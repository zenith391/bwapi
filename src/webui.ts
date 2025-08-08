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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { Express, Request, Response } from "express";
import session, { SessionData } from "express-session";
import fs from "fs";
import url from "url";
import { loginToAccount } from "./launcher_auth.js";
import { User } from "./users.js";
import config from "./config.js";

declare module "express-session" {
  interface SessionData {
    user?: string;
    error?: string;
  }
}

interface WebUIConfig {
  secret: string;
  moderators: string[];
}

let conf: WebUIConfig = {
  secret: "",
  moderators: [],
};

interface AuthTokens {
  [key: string]: string;
}

let authTokens: AuthTokens = {};

interface World {
  first_published_at?: string;
  publication_status?: number;
  [key: string]: any;
}

interface WorldWithTime {
  world: World;
  time: number;
}

function loginPath(app: Express) {
  app.get("/webui/login", function (req: Request, res: Response) {
    res.locals.message = "";
    res.render("login");
  });

  app.post("/webui/login", async function (req: Request, res: Response) {
    if (req.body.username && req.body.password) {
      try {
        const authToken: string = await loginToAccount(
          req.body.username,
          req.body.password,
        );
        const userId: string = authTokens[authToken];
        if (conf.moderators.indexOf(userId) === -1) {
          res.locals.message = "Not a moderator!";
          res.render("login");
        } else {
          req.session.regenerate(() => {
            (req.session as SessionData).user = authTokens[authToken];
            res.redirect("/webui/");
          });
        }
      } catch (e: any) {
        res.locals.message = e.message;
        res.render("login");
      }
    } else {
      (req.session as SessionData).error = "Could not authenticate.";
      res.render("login");
    }
  });
}

function home(req: Request, res: Response) {
  if (req.session) {
    if ((req.session as SessionData).user) {
      res.render("home");
    } else {
      res.redirect("/webui/login");
    }
  } else {
    res.redirect("/webui/login");
  }
}

function newWorlds(req: Request, res: Response) {
  let u = url.parse(req.url, true);
  worldCache(function (err: Error | null, worlds: Record<string, World>) {
    const worldsArray = Object.values(worlds);
    const worldsWithTime: World[] = worldsArray
      .map((world: World) => {
        let date = new Date(world["first_published_at"] || "");
        if (
          world["first_published_at"] === undefined ||
          isNaN(date.getTime())
        ) {
          return {
            world: world,
            time: 0,
          };
        } else {
          return {
            world: world,
            time: date.getTime(),
          };
        }
      })
      .sort(function (a: WorldWithTime, b: WorldWithTime) {
        return b.time - a.time;
      })
      .map(function (v: WorldWithTime) {
        return v.world;
      });

    let publishedWorlds: World[] = [];

    for (const i in worldsWithTime) {
      let world = worldsWithTime[i];
      if (world["publication_status"] === 1) {
        publishedWorlds.push(world);
      }
    }

    let page: number = 1;
    if (Array.isArray(u.query.page)) {
      page = parseInt(u.query.page[0]);
    } else {
      page = parseInt(u.query.page || "1");
    }
    if (page === null || page === undefined || page < 1) {
      page = 1;
    }
    page--;
    let start = Math.min(publishedWorlds.length, 24 * page);
    let end = Math.min(publishedWorlds.length, start + 24);
    let totalPages = Math.ceil(publishedWorlds.length / 24);
    let finalPage: World[] = [];
    for (let i = start; i < end; i++) {
      finalPage.push(publishedWorlds[i]);
    }

    res.locals.worlds = finalPage;
    res.locals.totalPages = totalPages;
    res.locals.activePage = page;
    res.locals.moderator = req.session && (req.session as SessionData).user;
    res.render("worlds");
  });
}

function stats(req: Request, res: Response) {
  if ((req.session as SessionData).user) {
    let memory = process.memoryUsage();
    res.status(200).json({
      memory: {
        used: memory.heapUsed,
        total: memory.heapTotal,
      },
    });
  }
}

async function metrics(req: Request, res: Response) {
  let worlds = fs.readdirSync("worlds");
  let models = fs.readdirSync("models");
  res.locals.worlds = worlds.length;
  res.locals.models = models.length;
  res.locals.players = await User.count();
  res.render("metrics");
}

export function run(app: Express) {
  if (app.get("views") !== config.ROOT_NAME + "/views") {
    // not default path
    console.error("Overriding previous view module: " + app.get("views"));
    return;
  }

  app.set("view engine", "ejs");
  app.set("views", config.ROOT_NAME + "/data/webui");

  if (!fs.existsSync("conf/plugins")) {
    fs.mkdirSync("conf/plugins");
  }

  if (!fs.existsSync("conf/plugins/webui.json")) {
    fs.writeFileSync(
      "conf/plugins/webui.json",
      JSON.stringify(
        {
          secret: "change this with the cookie secret",
          accounts: {},
        },
        null,
        2,
      ),
    );
  }
  conf = JSON.parse(fs.readFileSync("conf/plugins/webui.json", "utf8"));

  app.use(
    "/webui/*",
    session({
      resave: false,
      saveUninitialized: false,
      secret: conf.secret,
    }),
  );

  app.get("/webui/", home);
  app.get("/webui/home", home);
  app.get("/webui/server_stats", stats);
  app.get("/webui/server_metrics", metrics);

  app.get(
    "/webui/server_metrics/steam_active_players.csv",
    function (req: Request, res: Response) {
      res.status(200).sendFile(config.ROOT_NAME + "/steam_active_players.csv");
    },
  );
  app.get(
    "/webui/server_metrics/ios_active_players.csv",
    function (req: Request, res: Response) {
      res.status(200).sendFile(config.ROOT_NAME + "/ios_active_players.csv");
    },
  );
  app.get(
    "/webui/server_metrics/launcher_active_players.csv",
    function (req: Request, res: Response) {
      res
        .status(200)
        .sendFile(config.ROOT_NAME + "/launcher_active_players.csv");
    },
  );
  app.get(
    "/webui/server_metrics/total_worlds.csv",
    function (req: Request, res: Response) {
      res.status(200).sendFile(config.ROOT_NAME + "/total_worlds.csv");
    },
  );
  app.get(
    "/webui/server_metrics/total_models.csv",
    function (req: Request, res: Response) {
      res.status(200).sendFile(config.ROOT_NAME + "/total_models.csv");
    },
  );
  app.get(
    "/webui/server_metrics/total_players.csv",
    function (req: Request, res: Response) {
      res.status(200).sendFile(config.ROOT_NAME + "/total_players.csv");
    },
  );

  app.get("/webui/world/reject/:id", function (req: Request, res: Response) {
    const id = req.params.id;
    if (req.session && (req.session as SessionData).user) {
      if (fs.existsSync("worlds/" + id)) {
        let metadata = JSON.parse(
          fs.readFileSync("worlds/" + id + "/metadata.json", {
            encoding: "utf8",
          }),
        );
        metadata["publication_status"] = 2; // rejected publication status
        fs.writeFileSync(
          "worlds/" + id + "/metadata.json",
          JSON.stringify(metadata, null, 2),
        );
        res.redirect("/webui/worlds");
        console.log("Rejected world " + id);
        worldCacheSet(id, metadata);
      }
    } else {
      res.redirect("/webui/login");
    }
  });

  app.get("/webui/user/ban/:id", async function (req: Request, res: Response) {
    const id = req.params.id;
    if (req.session && (req.session as SessionData).user) {
      const user = new User(id);
      if (await user.exists()) {
        await user.ban();
        res.redirect("/webui/worlds");
        console.log("Banned user " + id + " from publishing");
      }
    } else {
      res.redirect("/webui/login");
    }
  });

  app.get("/webui/worlds", newWorlds);

  app.get("/webui/logout", function (req: Request, res: Response) {
    req.session.destroy(function () {
      res.redirect("/webui/");
    });
  });

  loginPath(app);
}

// Placeholder functions for worldCache and worldCacheSet
function worldCache(
  callback: (err: Error | null, worlds: Record<string, World>) => void,
) {
  // Implementation needed
  callback(new Error("Not implemented"), {});
}

function worldCacheSet(id: string, metadata: World) {
  // Implementation needed
}
