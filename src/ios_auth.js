import fs from "fs";
import url from "url";
import uuid from "uuid";
import { User } from "./users.js";

let iosLinks = {};

let dayLogins = 0;
let dayLoginsDate;

async function ios_current_user(req, res, u) {
	let gc_id = u.query.game_center_player_id

	console.log(gc_id + " is logging in (iOS)..");
	if (iosLinks[gc_id] !== undefined) {
		const userId = iosLinks[gc_id];
		const user = new User(userId);

		let authToken = uuid.v4();
		let worldTemplates = [];
		fs.readdir("conf/world_templates", async function(err, files) {
			for (const j in files) {
				let path = "conf/world_templates/" + files[j] + "/"
				let worldTemplate = JSON.parse(fs.readFileSync(path + "metadata.json"));
				worldTemplate["world_source"] = fs.readFileSync(path + "source.json", {"encoding": "utf8"});
				worldTemplates.push(worldTemplate);
			}
			console.log("New auth token " + authToken + " for iOS user " + userId);

			let metadata = await user.getMetadata();
			metadata["auth_token"] = authToken;
			metadata["blocks_inventory_str"] = fs.readFileSync("conf/user_block_inventory.txt", {"encoding":"utf8"});
			metadata["world_templates"] = worldTemplates;
			metadata["_SERVER_worlds"] = undefined;
			metadata["_SERVER_models"] = undefined;
			metadata["_SERVER_groups"] = undefined;
			metadata["purchased_building_set_ids"] = [123789456];
			metadata["game_center_player_id"] = gc_id;
			// TODO: completed_puzzles_ids

			// user["api_v2_supported"] = true; // iOS can't be modded as of now
			authTokens[authToken] = userId;

			let date = new Date();
			let line = date.toLocaleDateString("en-US");
			let csv = fs.readFileSync("ios_active_players.csv").toString();
			let lines = csv.split("\n");
			let lastLine = lines[lines.length-1].split(",");
			if (lastLine[0] == line) {
				dayLogins = parseInt(lastLine[1]) + 1;
				lines[lines.length-1] = line + "," + dayLogins;
				fs.writeFileSync("ios_active_players.csv", lines.join("\n"));
			} else {
				dayLogins = 1; // we changed day
				fs.appendFileSync("ios_active_players.csv", "\n" + line + "," + dayLogins);
			}

			res.status(200).json(metadata);
			console.log("iOS login done!");
		});
	} else {
		console.log("no such user");
		res.status(404).json({
			"error": 404,
			"error_msg": "no iOS user with id " + gc_id
		});
	}
}

async function ios_set_username(req, res) {
	const valid = validAuthToken(req, res, true);
	if (valid.ok === false) return;

	const status = await valid.user.getStatus();
	if ((status & 2) == 0) {
		const newUsername = req.body["username"];
		console.log("Changed name of " + valid.user.id + " to " + newUsername);
		await valid.user.setUsername(newUsername);
	}
	
	res.status(200).json(await valid.user.getMetadata());
}

export function run(app) {
	iosLinks = JSON.parse(fs.readFileSync("conf/ios_links.json"));

	app.get("/api/v1/current_user", async function(req, res) {
		await ios_current_user(req, res, url.parse(req.url, true));
	});

	app.put("/api/v1/current_user/username", ios_set_username);

	app.post("/api/v1/users", async function(req, res) {
		const gcId = req.body.game_center_player_id;
		let username = req.body.username;
		if (username === undefined) username = null; // null username = Unnamed Blockster

		if (gcId !== undefined) {
			if (iosLinks[gcId] !== undefined) {
				res.status(500);
			} else {
				console.log("Creating user " + username + " with GC ID " + gcId);
				const newUser = await User.create(username, 256 | 512);
				iosLinks[gcId] = newUser.id;
				fs.writeFileSync("conf/ios_links.json", JSON.stringify(iosLinks))
				await ios_current_user(req,res,{
					"query": {
						"game_center_player_id": gcId
					}
				});
			}
		} else {
			res.status(500);
		}
	});

	app.post("/api/v1/current_user/daily_reward", function(req, res) {
		console.log(req.body);
		// res.status(200).json({
		// 	//"rewards_ladder_conf": "",
		// 	//"reward": "",
		// 	//"reward_index": "1",
		// 	//"days_to_next_reset": "1"
		// });
		res.status(500);
	});

	app.post("/api/v1/current_user/tutorial_started", async function(req, res) {
		let valid = validAuthToken(req, res);
		if (valid.ok === false) return;

		await valid.user.completeTutorial();
	});

	app.post("/api/v1/spinner/spin", async function(req, res) {
		let valid = validAuthToken(req, res);
		if (valid.ok === false) return;

		const wonSlot = Math.floor(Math.random() * 10);
		const prizeWheel = JSON.parse(fs.readFileSync("conf/daily_spinner_tier1.json", { encoding: "utf8" }));
		const won = prizeWheel[wonSlot];
		
		let meta = await valid.user.getMetadata();
		if (meta.spinner1_unlocked === false) {
			res.status(400).json({ });
			return;
		}
		if (won.game_coins) meta.coins += won.game_coins;
		if (won.game_gems)  meta.game_gems += won.game_gems;
		meta.spinner1_unlocked = false;
		await valid.user.setMetadata(meta);

		res.status(200).json({
			"winning_slot": wonSlot,
			"attrs_for_current_user": meta
		});
	});

	app.get("/api/v1/subscription_building_sets", async function(req, res) {
		res.status(200).json({
			"building_sets": [
				
			]
		})
	})

	app.get("/api/v1/building_set_franchises", async function(req, res) {
		res.status(200).json({
			"building_set_franchises": [
				{
					"id": 1,
					"index": 0,
					"name": "Zen1th & Friends",
					"description": "Lorem ipsum dolor sit amet",
					"image_urls_for_sizes": {
						"220x220": "https://bwsecondary.ddns.net:8080/images/28",
						"440x440": "https://bwsecondary.ddns.net:8080/images/29"
					}
				}
			]
		})
	});

	app.get("/api/v1/building_sets", async function(req, res) {
		const query = url.parse(req.url, true).query;
		const setType = query.attrs_for_type;

		fs.readdir("conf/world_templates", function(err, files) {
			let worldTemplates = [];
			for (const name of files) {
				let path = "conf/world_templates/" + name + "/"
				let worldTemplate = JSON.parse(fs.readFileSync(path + "metadata.json"));
				worldTemplate["world_source"] = fs.readFileSync(path + "source.json", {"encoding": "utf8"});
				worldTemplates.push(worldTemplate);
			}

			let buildingSets = [];
			if (setType === "purchased_building_set") {
				buildingSets.push({
					"id": 123789456,
					"title": "BW2 Pack",
					"subtitle": "It's free. It's BW2. It's awesome!",
					"puzzle_subtitle": "\"puzzle\"",
					"internal_identifier": "bw2_pack",
					"puzzles": [],
					"world_templates": worldTemplates
				})
			}
			res.status(200).json({
				"building_sets": buildingSets
			})
		})
	})

	app.get("/api/v1/spinner/configuration", function(req, res) {
		res.status(200).json({
			"1": {
				"updated_at": dateString(),
				"slot_contents": fs.readFileSync("conf/daily_spinner_tier1.json", { encoding: "utf8" })
			},
			"2": {
				"updated_at": dateString(),
				//"slot_contents": `[]`
			}
		});
	});

	app.put("/api/v1/current_user/agreed-to-tos", async function(req, res) {
		let valid = validAuthToken(req, res);
		if (valid.ok === false) return;
		await valid.user.agreeToToS();
		res.status(200).json({});
	});

	app.put("/api/v1/current_user/agreed-to-u2u-tos", async function(req, res) {
		let valid = validAuthToken(req, res);
		if (valid.ok === false) return;
		await valid.user.agreeToU2UToS();
		res.status(200).json({});
	})
}
