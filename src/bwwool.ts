/**
	bwapi - Blocksworld API server reimplementation
    Copyright (C) 2020 zenith391

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
**/
import fs from "fs";
import url, { URL } from "url";
import { User } from "./users.js";
import "reflect-metadata";

// sha3-512 hash of kJdiua247ks12fdDDIOJH12ao4155FJH1Ijdf
const API_KEY = "1b3233bbdc822e86717a1d6bfd29ac14bcb2a549349a3ee44b6aa1fe340d4946fb6f823d396f21efa4d808e6b4ceb10b007db3bc3c3309a2896ad3f1d03c4ea0";

function getBWUser(linkId: string) {
	return new User(parseInt(fs.readFileSync("usersWoolLinks/" + linkId + ".txt", {"encoding": "utf8"})));
}

async function getUserByName(name: string) {
	const users = await User.list();
	for (const user of users) {
		const username = await user.getUsername();
		if (username == name) {
			return user;
		}
	}
	return null;
}

export function run(app: any) {
	app.get("/api/bw_wool/user_id", function(req: any, res: any) {
		const query = new URL(req.url).searchParams;
		if (query.get("api_key") !== API_KEY) {
			res.status(200).json({
				"error": 403,
				"error_msg": "Not authentificated as Blocksworld Wool."
			});
			return;
		}

		const linkId = query.get("link_id");
		if (linkId === null) {
			res.status(200).json({
				"error": 403,
				"error_msg": "Not authentificated as Blocksworld Wool."
			});
			return;
		}

		const user = getBWUser(linkId);
		res.status(200).json({
			"user_id": user.id
		});
	});

	app.get("/api/bw_wool/coinpal/pay", async function(req: any, res: any) {
		const query = new URL(req.url).searchParams;
		if (query.get("api_key") !== API_KEY) {
			res.status(200).json({
				"error": 403,
				"error_msg": "Not authentificated as Blocksworld Wool."
			});
			return;
		}

		const receiverId = query.get("receiver");
		if (receiverId === null) {
			res.status(200).json({
				"error": 403,
				"error_msg": "Missing receiver"
			});
			return;
		}

		const linkId = query.get("link_id");
		if (linkId === null) {
			res.status(200).json({
				"error": 403,
				"error_msg": "Missing link identifier"
			});
			return;
		}

		const amount = parseInt(query.get("amount") ?? "");
		if (isNaN(amount)) {
			res.status(200).json({
				"error": 403,
				"error_msg": "Invalid or missing amount"
			});
			return;
		}

		const subject = query.get("subject");
		if (subject === null) {
			res.status(200).json({
				"error": 403,
				"error_msg": "Missing subject"
			});
			return;
		}

		const sender = getBWUser(linkId);
		const receiver = await getUserByName(receiverId);
		if (receiver === null) {
			res.status(200).json({
				"error": 404,
				"error_msg": "The user you are trying to send money to does not exists"
			});
			return;
		}

		await receiver.addPayout({
			"payout_type": "coins",
			"coin_grants": amount,
			"title": "CoinPal transaction",
			"msg2": "Subject: " + subject,
			"msg1": "Sent by " + await sender.getUsername(),
			"has_gold_border": false
		});
		await sender.setCoins(await sender.getCoins() - amount);

		res.status(200).json({
			"sent": true
		});
	});

	app.get("/api/bw_wool/redeem", async function(req: any, res: any) {
		let query = new URL(req.url).searchParams;
		if (query.get("api_key") !== API_KEY) {
			res.status(200).json({
				"error": 403,
				"error_msg": "Not authentificated as Blocksworld Wool."
			})
			return;
		}

		const giftKey = query.get("gift_key");
		if (giftKey === null) {
			res.status(200).json({
				"error": 403,
				"error_msg": "Missing gift key"
			})
			return;
		}

		const linkId = query.get("link_id");
		if (linkId === null) {
			res.status(200).json({
				"error": 403,
				"error_msg": "Missing link identifier"
			})
			return;
		}

		let gifts = JSON.parse(fs.readFileSync("conf/gifts.json", { encoding: "utf8" }));
		for (const key in gifts["gifts"]) {
			if (key === giftKey) {
				const gift = gifts["gifts"][key];
				const user = getBWUser(linkId);
				await user.addPayout({
					"payout_type": "coins",
					"coin_grants": gift.coins,
					"title": "Gift",
					"msg1": "You redeemed a gift code!",
					"has_gold_border": true
				});
				gifts["gifts"][key] = undefined;
				fs.writeFileSync("conf/gifts.json", JSON.stringify(gifts));

				res.status(200).json({
					"redeemed": true,
					"coins_added": gift.coins
				});
				return;
			}
		}
		res.status(200).json({
			"error": 404,
			"error_msg": "Invalid or redeemed gift key."
		});
	});
	
	app.get("/api/bw_wool/link", function(req: any, res: any) {
		let query = new URL(req.url).searchParams;

		if (query.get("api_key") !== API_KEY) {
			res.status(200).json({
				"error": 403,
				"error_msg": "Not authentificated as Blocksworld Wool."
			})
			return;
		}

		const worldName = query.get("world_name");
		if (worldName === null) {
			res.status(200).json({
				"error": 403,
				"error_msg": "Not authentificated as Blocksworld Wool."
			})
			return;
		}

		const username = query.get("username");
		if (username === null) {
			res.status(200).json({
				"error": 403,
				"error_msg": "Not authentificated as Blocksworld Wool."
			})
			return;
		}

		fs.readdir("worlds", async function(err, files) {
			for (const i in files) {
				const metadata = JSON.parse(fs.readFileSync("worlds/"+files[i]+"/metadata.json", { encoding: "utf8" }));
				if (metadata["title"] == query.get("world_name")) {
					const author = new User(metadata["author_id"]);
					const username = await author.getUsername();
					
					if (username === query.get("username")) {
						let uuid = require("uuid/v4")();
						fs.writeFile("usersWoolLinks/" + uuid + ".txt", metadata["author_id"].toString(), function(err) {
							if (err) throw err;
							res.status(200).json({
								"link_id": uuid,
								"username": username
							});
						});
						return;
					}
				}
			}
			res.status(200).json({
				"error": 404,
				"error_msg": "The world was not found, is the world title or BW username wrong?"
			})
		});
	});
} 
