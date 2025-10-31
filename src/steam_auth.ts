/**
	bwapi - Blocksworld API server reimplementation
    Copyright (C) 2025 zenith391

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import { urlencoded } from "express";
import fs from "fs";
import url from "url";
import { v4 as uuidv4 } from "uuid";
import { insertLogin, EventType } from "./analytics.js";
import { Request, Response, Express } from "express";
import { User, LinkType } from "./users.js";
import { BWRequest, dateString, validAuthToken } from "./util.js";
import config from "./config.js";

interface SteamUserBody {
  steam_id: string;
  steam_auth_ticket: string;
  steam_persona: string;
  steam_nickname: string;
}

async function steam_current_user(req: BWRequest, res: Response, u: any) {
  const steamId = u.query.steam_id as string;
  const authTicket = u.query.steam_auth_ticket as string;
  console.log(`${steamId} is logging in (steam)..`);

  if (fs.existsSync(`usersSteamLinks/${steamId}.txt`)) {
    const userId = fs.readFileSync(`usersSteamLinks/${steamId}.txt`, {
      encoding: "utf8",
    });
    const user = new User(userId);
    const userStatus = await user.getStatus();
    if (config.EARLY_ACCESS && (userStatus & 4) == 0) {
      await user.setStatus(userStatus | 4);
      console.log("Adding early access user status to user " + userId);
    }

    const authToken = uuidv4();
    const worldTemplates: any[] = [];

    const userFiles = [
      { path: "world_ratings.json", content: '{"ratings": {}}' },
      { path: "pending_payouts.json", content: '{"pending_payouts": []}' },
      { path: "model_ratings.json", content: '{"ratings": {}}' },
      { path: "friends.json", content: '{"friends": {}}' },
    ];

    userFiles.forEach((file) => {
      if (!fs.existsSync(`users/${userId}/${file.path}`)) {
        fs.writeFileSync(`users/${userId}/${file.path}`, file.content);
      }
    });

    let metadata: any = await user.getMetadata();
    fs.readdir("conf/world_templates", async (err, files) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ error: 500, error_msg: "Internal server error" });
      }

      for (const file of files) {
        const path = `conf/world_templates/${file}/`;
        const worldTemplate = JSON.parse(
          fs.readFileSync(`${path}metadata.json`, { encoding: "utf8" }),
        );
        worldTemplate["world_source"] = fs.readFileSync(`${path}source.json`, {
          encoding: "utf8",
        });
        worldTemplates.push(worldTemplate);
      }

      console.log(`New auth token ${authToken} for Steam user ${userId}`);
      metadata["auth_token"] = authToken;
      metadata["blocks_inventory_str"] = fs.readFileSync(
        "conf/user_block_inventory.txt",
        { encoding: "utf8" },
      );
      metadata["world_templates"] = worldTemplates;
      delete metadata["worlds"];
      delete metadata["_SERVER_worlds"];
      delete metadata["_SERVER_models"];
      delete metadata["_SERVER_groups"];
      metadata["api_v2_supported"] = true;
      (global as any).authTokens[authToken] = parseInt(userId);

      await insertLogin(req.db, EventType.STEAM_LOGIN, new Date());
      res.status(200).json(metadata);
      console.log("Steam login done!");
    });
  } else {
    console.log("no such user");
    res.status(404).json({
      error: 404,
      error_msg: `no steam user with id ${steamId}`,
    });
  }
}

async function steam_set_username(req: Request, res: Response) {
  const valid = validAuthToken(req, res, true);
  if (valid.ok === false) return;

  const nickname = req.body["steam_nickname"];
  console.log(`Changed name of ${valid.user.id} to ${nickname}`);
  await valid.user.setUsername(nickname);
  res.status(200).json(await valid.user.getMetadata());
}

async function create_steam_user(req: BWRequest, res: Response) {
  const {
    steam_id,
    steam_auth_ticket,
    steam_persona,
    steam_nickname,
  }: SteamUserBody = req.body;

  if (!steam_id || !steam_auth_ticket || !steam_persona || !steam_nickname) {
    return res.status(400).json({ error: 400, error_msg: "Missing field" });
  }

  const newUser = await User.create(steam_persona, LinkType.Steam);
  fs.writeFileSync(`usersSteamLinks/${steam_id}.txt`, newUser.id.toString());
  await steam_current_user(req, res, {
    query: {
      steam_id,
      steam_auth_ticket,
    },
  });
}

export function run(app: Express, db: any) {
  if (!fs.existsSync("usersSteamLinks")) {
    fs.mkdirSync("usersSteamLinks");
    console.log('Created folder "usersSteamLinks"');
  }

  if (!fs.existsSync("total_players.csv")) {
    fs.writeFileSync("total_players.csv", "Data,Players");
  }

  app.get("/api/v1/steam_current_user", (req, res) => {
    steam_current_user(req as BWRequest, res, url.parse(req.url, true));
  });

  app.get("/api/v1/steam_current_user/locale", (req, res) => {
    res.status(404).json({ error: 404 });
  });

  app.post(
    "/api/v1/steam_current_user/username",
    urlencoded({ extended: false }),
    steam_set_username,
  );

  app.post("/api/v1/steam_users", urlencoded({ extended: false }), (req, res) =>
    create_steam_user(req as BWRequest, res),
  );
}
