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
import url from "url";
import uuid from "uuid";

export class User {

	constructor(id) {
		if (isNaN(parseInt(id))) {
			throw "Invalid user identifier";
		}
		this.id = parseInt(id);
	}

	static async create(username, linkType) {
		const statusFromLinkType = {
			wool: 1024
		}

		const newId = fs.readFileSync("conf/new_account_id.txt", {"encoding": "utf8"});
		fs.writeFileSync("conf/new_account_id.txt", (parseInt(newId)+1).toString());

		console.log("Creating user with ID " + newId);
		fs.mkdirSync("users/"+newId);
		let newUserStatus = statusFromLinkType[linkType];
		if (EARLY_ACCESS)
			newUserStatus |= 4; // add "early access" flag
		let userInfo = {
			"coins": 100,
			"ios_link_available": false,
			"ios_link_initiated": false,
			"is_username_blocked": false,
			"profile_image_url": HOST + "/images/categories/default_pfp.png",
			"id": parseInt(newId),
			"username": username,
			"user_status": newUserStatus, // see Util.cs in Blocksworld source code for info about user_status
			"account_type": "user",
			"blocksworld_premium": 0,
			"_SERVER_worlds": [],
			"_SERVER_models": [],
			"_SERVER_groups": []
		}
		fs.writeFileSync("users/"+newId+"/metadata.json", JSON.stringify(userInfo));
		fs.writeFileSync("users/"+newId+"/followed_users.json", "{\"attrs_for_follow_users\": {}}");
		fs.writeFileSync("users/"+newId+"/followers.json", "{\"attrs_for_follow_users\": {}}");
		fs.writeFileSync("users/"+newId+"/liked_worlds.json", "{\"worlds\": []}");
		fs.writeFileSync("users/"+newId+"/played_worlds.json", "{\"worlds\": []}");
		fs.writeFileSync("users/"+newId+"/world_ratings.json", "{\"ratings\": {}}");
		fs.writeFileSync("users/"+newId+"/model_ratings.json", "{\"ratings\": {}}");
		fs.writeFileSync("users/"+newId+"/pending_payouts.json", "{\"pending_payouts\": []}");
		fs.writeFileSync("users/"+newId+"/news_feed.json", JSON.stringify({
			"news_feed": [{ "type": 101, "timestamp": dateString() }]
		}));

		let date = new Date();
		let line = date.toLocaleDateString("en-US");
		let csv = fs.readFileSync("total_players.csv").toString();
		let lines = csv.split("\n");
		let lastLine = lines[lines.length-1].split(",");
		const totalWorlds = fs.readdirSync("users").length-2+3;
		if (lastLine[0] == line) {
			lines[lines.length-1] = line + "," + totalWorlds;
			fs.writeFileSync("total_players.csv", lines.join("\n"));
		} else {
			fs.appendFileSync("total_players.csv", "\n" + line + "," + totalWorlds);
		}

		return new User(newId);
	}

	static async list() {
		let users = [];
		const listing = fs.readdirSync("users/");
		for (const dir of listing) {
			const id = parseInt(dir);
			if (isNaN(id) === false) {
				users.push(new User(id));
			}
		}
		return users;
	}

	static async count() {
		return fs.readdirSync("users/").length - 2 + 3; // minus user_list.js and owner_of.js
	}

	async addPayout(payout) {
		let payouts = this.getPendingPayouts();
		if (!Array.isArray(payouts)) {
			payouts = [];
		}

		let nextId = 0;
		for (const i in payouts) {
			nextId = Math.max(nextId, i+1);
		}
		payout["ref_id"] = nextId+1;
		payouts.push(payout);
		this.setPendingPayouts(payouts);
	}

	async exists() {
		//return await redis.exists("user:" + this.id);
		return fs.existsSync("users/" + this.id);
	}

	async getMetadata() {
		if (this._metadata === undefined) {
			this._metadata = JSON.parse(fs.readFileSync("users/" + this.id + "/metadata.json"));
			this._metadata.id = this.id;

			if (this._metadata["game_gems"] === undefined) {
				this._metadata["game_gems"] = 0;
				this._metadata["agreed_to_tos"] = false;
				this._metadata["agreed_to_u2u_tos"] = false;
				this._metadata["spinner1_unlocked"] = true;
				this._metadata["spinner2_unlocked"] = false;
			}
		}
		return this._metadata;
	}

	async getFollowers() {
		if (this._followers === undefined) {
			if (!fs.existsSync("users/" + this.id + "/followers.json")) {
				fs.writeFileSync("users/" + this.id + "/followers.json", "{\"attrs_for_follow_users\":{}}");
			}

			const rawFollowers = JSON.parse(fs.readFileSync("users/" + this.id + "/followers.json"))["attrs_for_follow_users"];
			this._followers = [];
			for (const i in rawFollowers) {
				if (rawFollowers[i] != undefined) {
					this._followers.push({
						user: new User(i.substring(1)),
						date: rawFollowers[i]
					})
				}
			}
		}
		return this._followers;
	}

	async getFollowedUsers() {
		if (this._followedUsers === undefined) {
			if (!fs.existsSync("users/" + this.id + "/followed_users.json")) {
				fs.writeFileSync("users/" + this.id + "/followed_users.json", "{\"attrs_for_follow_users\":{}}");
			}

			const rawFollowedUsers = JSON.parse(fs.readFileSync("users/" + this.id + "/followed_users.json"))["attrs_for_follow_users"];
			this._followedUsers = [];
			for (const i in rawFollowedUsers) {
				if (rawFollowedUsers[i] != undefined) {
					this._followedUsers.push({
						user: new User(i.substring(1)),
						date: rawFollowedUsers[i]
					})
				}
			}
		}
		return this._followedUsers;
	}

	async getPendingPayouts() {
		if (this._pendingPayout === undefined) {
			this._pendingPayouts = JSON.parse(fs.readFileSync("users/" + this.id + "/pending_payouts.json"))["pending_payouts"];
		}
		return this._pendingPayouts;
	}

	async getPurchasedModels() {
		if (this._purchasedModels === undefined) {
			if (!fs.existsSync("users/" + this.id + "/purchased_u2u_models.json")) {
				fs.writeFileSync("users/" + this.id + "/purchased_u2u_models.json", "{\"u2u_models\":[]}");
			}
			this._purchasedModels = JSON.parse(fs.readFileSync("users/" + this.id + "/purchased_u2u_models.json"))["u2u_models"];
		}
		return this._purchasedModels;
	}

	async getFeeds() {
		if (this._feeds === undefined) {
			if (!fs.existsSync("users/" + this.id + "/news_feed.json")) {
				fs.writeFileSync("users/" + this.id + "/news_feed.json", "{\"news_feed\":[]}");
			}
			this._feeds = JSON.parse(fs.readFileSync("users/" + this.id + "/news_feed.json"))["news_feed"];
		}
		return this._feeds;
	}

	async getLikedWorlds() {
		if (this._likedWorlds === undefined) {
			if (!fs.existsSync("users/" + this.id + "/liked_worlds.json")) {
				fs.writeFileSync("users/" + this.id + "/liked_worlds.json", "{\"worlds\":[]}");
			}
			this._likedWorlds = JSON.parse(fs.readFileSync("users/" + this.id + "/liked_worlds.json"))["worlds"];
		}
		return this._likedWorlds;
	}

	async appendPurchasedModel(modelId) {
		let purchasedModels = getPurchasedModels();
		purchasedModels.push(modelId);
		fs.writeFileSync("users/" + this.id + "/purchased_u2u_models.json", JSON.stringify({
			u2u_models: purchasedModels
		}));
	}

	async addFeed(feed) {
		feed.timestamp = dateString();

		let newsFeed = await this.getFeeds();
		newsFeed.unshift(feed);
		await this.setFeeds(newsFeed);
	}

	async setMetadata(newValue) {
		this._metadata = newValue;
		fs.writeFileSync("users/" + this.id + "/metadata.json", JSON.stringify(newValue));
	}

	async setFollowers(newValue) {
		this._followers = newValue;
		fs.writeFileSync("users/" + this.id + "/followers.json", JSON.stringify({
			attrs_for_follow_users: newValue
		}));
	}

	async setPendingPayouts(newValue) {
		this._pendingPayouts = newValue;
		fs.writeFileSync("users/" + this.id + "/pending_payouts.json", JSON.stringify({
			pending_payouts: newValue
		}));
	}

	async setFeeds(newValue) {
		this._feeds = newValue;
		fs.writeFileSync("users/" + this.id + "/news_feed.json", JSON.stringify({
			news_feed: newValue
		}));
	}

	invalidate() {
		this._metadata = undefined;
		this._followers = undefined;
	}

	async getProfileImageURL() {
		return (await this.getMetadata()).profile_image_url;
	}

	async getOwnedWorlds() {
		return (await this.getMetadata())["_SERVER_worlds"];
	}

	async getOwnedModels() {
		const ownedModels = (await this.getMetadata())["_SERVER_models"];
		if (ownedModels === undefined) {
			return [];
		} else {
			return ownedModels;
		}
	}

	async appendOwnedWorld(worldId) {
		let metadata = await this.getMetadata();
		metadata["_SERVER_worlds"].push(worldId);
		await this.setMetadata(metadata);
	}

	async appendOwnedModel(modelId) {
		let metadata = await this.getMetadata();
		metadata["_SERVER_models"].push(modelId);
		await this.setMetadata(metadata);
	}

	async getCoins() {
		return (await this.getMetadata()).coins;
	}

	async getUsername() {
		return (await this.getMetadata()).username;
	}

	async getStatus() {
		return (await this.getMetadata()).user_status;
	}

	async getAccountType() {
		const metadata = await this.getMetadata();
		if (metadata["account_type"] === undefined) return "user";
		return metadata["account_type"];
	}

	async setCoins(newValue) {
		let metadata = await this.getMetadata();
		metadata.coins = newValue;
		await this.setMetadata(metadata);
	}

	async setStatus(newValue) {
		let metadata = await this.getMetadata();
		metadata.user_status = newValue;
		await this.setMetadata(metadata);
	}

}

export async function socialUser(id, date) {
	const user = new User(id);
	const metadata = await user.getMetadata();
	return {
		"user_id": parseInt(id),
		"username": metadata["username"],
		"user_status": metadata["user_status"],
		"user_blocksworld_premium": metadata["user_status"],
		"started_following_at": date,
		"profile_image_url": metadata["profile_image_url"],
		"relationship": 1
	}
}

// Module code //
async function basic_info(req, res) {
	let userId = req.params.id
	if (!fs.existsSync("users/" + userId + "/metadata.json")) {
		res.status(404).json({
			"error": 404,
			"error_msg": "user not found."
		});
	}
	let metadata = JSON.parse(fs.readFileSync("users/"+userId+"/metadata.json"));
	let json = {
		"id": metadata.id,
		"username": metadata.username,
		"is_username_blocked": metadata.is_username_blocked,
		"is_image_locked": metadata.is_image_locked,
		"user_status": metadata.user_status,
		"account_type": metadata["account_type"],
		"blocksworld_premium": metadata.blocksworld_premium,
		"profile_image_url": metadata.profile_image_url,
		"coins": metadata.coins
	}
	if (metadata["account_type"] == "group") {
		json["worlds_ids"] = metadata["_SERVER_worlds"];
		json["owner_id"] = metadata["owner_id"];
		let members = [];
		for (const id of metadata["members"]) {
			const member = new User(id);
			members.push(await member.getUsername());
		}
		json["members_usernames"] = members;
		json["members_ids"] = metadata["members"];
	}
	res.status(200).json(json);
}

async function save_current_user_profile_world(req, res) {
	let valid = validAuthToken(req, res, false);
	if (!valid.ok) return;

	let userId = valid.user.id;
	console.log("User " + userId + " uploading his profile world.");
	if (!fs.existsSync("users/"+userId+"/profile_world")) {
		fs.mkdirSync("users/"+userId+"/profile_world");
		fs.copyFileSync("conf/default_profile_world.txt", "users/"+userId+"/profile_world/source.json");
		fs.writeFileSync("users/"+userId+"/profile_world/metadata.json",
			JSON.stringify({
				"app_version": req.headers["bw-app-version"],
				"author_id": parseInt(userId),
				"image_urls_for_sizes": {},
				"profile_gender": "unknown",
				"updated_at_timestamp": Date.now()
			}));
	}
	let meta = JSON.parse(fs.readFileSync("users/"+userId+"/profile_world/metadata.json"));
	if (req.body["source_json_str"]) {
		fs.writeFileSync("users/"+userId+"/profile_world/source.json", value2(req.body["source_json_str"]));
	}
	if (req.body["avatar_source_json_str"]) {
		fs.writeFileSync("users/"+userId+"/profile_world/avatar_source.json", value2(req.body["avatar_source_json_str"]));
	}
	if (req.body["profile_gender"]) {
		meta["profile_gender"] = value2(req.body["profile_gender"]);
	}
	meta["updated_at_timestamp"] = Date.now();
	fs.writeFileSync("users/"+userId+"/profile_world/metadata.json", JSON.stringify(meta));

	let userMeta = await valid.user.getMetadata();
	if (userMeta["is_image_locked"] != true) {
		if (req.files["profile_image"]) {
			fs.copyFileSync(req.files["profile_image"][0].path, "images/profiles/"+userId+".jpg");
			userMeta["profile_image_url"] = "https://bwsecondary.ddns.net:8080/images/profiles/"+userId+".jpg";
			fs.writeFileSync("users/"+userId+"/metadata.json", JSON.stringify(userMeta));
		}
	}
	await valid.user.setMetadata(userMeta);

	res.status(200).json(userMeta);
}

async function current_user_profile_world(req, res) {
	let valid = validAuthToken(req, res, false);
	if (valid.ok === false) return;
	let userId = valid.user.id;
	console.log("User " + userId + " downloading his profile world.");
	if (!fs.existsSync("users/"+userId+"/profile_world")) {
		fs.mkdirSync("users/"+userId+"/profile_world");
		fs.copyFileSync("conf/default_profile_world.txt", "users/"+userId+"/profile_world/source.json");
		fs.writeFileSync("users/"+userId+"/profile_world/metadata.json",
			JSON.stringify({
				"app_version": req.headers["bw-app-version"],
				"author_id": parseInt(userId),
				"image_urls_for_sizes": {},
				"profile_gender": "unknown",
				"updated_at_timestamp": Date.now()
			}));
	}

	let src = fs.readFileSync("users/"+userId+"/profile_world/source.json",{"encoding":"utf8"});
	let meta = JSON.parse(fs.readFileSync("users/"+userId+"/profile_world/metadata.json"));
	meta["image_url"] = await valid.user.getProfileImageURL();
	meta["source_json_str"] = src
	if (fs.existsSync("users/"+userId+"/profile_world/avatar_source.json")) {
		meta["avatar_source_json_str"] = fs.readFileSync("users/"+userId+"/profile_world/avatar_source.json",{"encoding":"utf8"});
	}
	meta = processUserWorld(meta)
	res.status(200).json(meta);
}

async function current_user_worlds(req, res) {
	let is_published = url.parse(req.url, true).query.is_published
	let valid = validAuthToken(req, res, false);
	if (valid.ok === false) return;
	const user = valid.user;
	console.log("User " + user.id + " downloading his worlds.");
	let metadata = await user.getMetadata();
	const ownedWorlds = await user.getOwnedWorlds();
	metadata.worlds = [];
	for (const id of ownedWorlds) {
		try {
			let w = await fullWorldSync(id, true);
			if (is_published == "yes") {
				if (w.publication_status == 1) {
					metadata.worlds.push(w);
				}
			} else {
				metadata.worlds.push(w);
			}
		} catch (e) {
			console.debug(e);
			console.error("could not retrieve worlds for user " + userId + "!");
			res.status(200).json({
				"error": 404,
				"error_msg": "Could not load your worlds."
			});
		}
	}
	metadata["_SERVER_worlds"] = undefined;
	metadata["_SERVER_models"] = undefined;
	metadata["_SERVER_groups"] = undefined;
	res.status(200).json(metadata);
}

async function current_user_worlds_for_teleport(req, res) {
	let valid = validAuthToken(req, res, false);
	if (valid.ok === false) return;
	const ownedWorlds = await valid.user.getOwnedWorlds()
	let worlds = [];
	for (const id of ownedWorlds) {
		try {
			let world = await fullWorldSync(id, true);
			if (!world["image_urls_for_sizes"]["440x440"]) {
				world["image_urls_for_sizes"]["440x440"] = "test";
			}
			if (!world["image_urls_for_sizes"]["220x220"]) {
				world["image_urls_for_sizes"]["220x220"] = "test";
			}
			worlds.push(world);
		} catch (e) {
			console.debug(e);
			console.error("could not retrieve worlds for user " + valid.user.id + "!");
			res.status(200).json({
				"error": 404,
				"error_msg": "Could not load your worlds."
			});
		}
	}
	res.status(200).json({
		"worlds": worlds
	});
}

function follow(req, res) {
	let valid = validAuthToken(req, res, false);
	if (!valid[0]) {
		return;
	}
	let userId = parseInt(valid[1]);
	let targetId = parseInt(req.params["id"]);
	let user = JSON.parse(fs.readFileSync("users/"+userId+"/followed_users.json"));
	let target;
	if (fs.existsSync("users/"+targetId+"/followers.json")) {
		target = JSON.parse(fs.readFileSync("users/"+targetId+"/followers.json"))
	} else {
		res.status(404).json({
			"error": "the target doesn't exists"
		});
		return;
	}
	user["attrs_for_follow_users"]["u"+targetId] = dateString();
	target["attrs_for_follow_users"]["u"+userId] = dateString();
	fs.writeFile("users/"+userId+"/followed_users.json", JSON.stringify(user), function(err) {
		if (err) console.error(err);
		fs.writeFile("users/"+targetId+"/followers.json", JSON.stringify(target), function(err) {
			if (err) console.error(err);
			res.status(200).json({"ok":true});
		});
	});
}

function unfollow(req, res) {
	let valid = validAuthToken(req, res, false);
	if (!valid[0]) {
		return;
	}
	let userId = parseInt(valid[1]);
	let targetId = parseInt(req.params["id"]);
	let user = JSON.parse(fs.readFileSync("users/"+userId+"/followed_users.json"));
	let target;
	if (fs.existsSync("users/"+targetId+"/followers.json")) {
		target = JSON.parse(fs.readFileSync("users/"+targetId+"/followers.json"))
	} else {
		res.status(404).json({
			"error": "the target doesn't exists"
		});
		return;
	}
	user["attrs_for_follow_users"]["u"+targetId] = undefined;
	target["attrs_for_follow_users"]["u"+userId] = undefined;
	fs.writeFile("users/"+userId+"/followed_users.json", JSON.stringify(user), function(err) {
		if (err) throw err;
		fs.writeFile("users/"+targetId+"/followers.json", JSON.stringify(target), function(err) {
			if (err) throw err;
			res.status(200).json({"ok":true});
		});
	});
}

export function run(app) {
	if (!fs.existsSync("users")) {
		fs.mkdirSync("users");
		console.log("Created folder \"users\"");
	}
	if (!fs.existsSync("conf/new_account_id.txt")) {
		fs.writeFileSync("conf/new_account_id.txt", "1")
		console.log("Created file \"conf/new_account_id.txt\"");
	}

	app.get("/api/v1/current_user/worlds", current_user_worlds);
	app.get("/api/v1/current_user/worlds_for_teleport", current_user_worlds_for_teleport);
	app.get("/api/v1/current_user/profile_world", current_user_profile_world);
	app.put("/api/v1/current_user/profile_world", save_current_user_profile_world);
	app.post("/api/v1/user/:id/follow_activity", follow);
	app.delete("/api/v1/user/:id/follow_activity", unfollow);

	app.get("/api/v1/user/:id/followed_users", async function(req, res) {
		const id = req.params["id"];
		const user = new User(id);
		if (await user.exists() === false) {
			res.status(404);
			return;
		}
		let out = [];
		const followedUsers = await user.getFollowedUsers();
		for (const followed of followedUsers) {
			out.push(await socialUser(followed.user.id, followed.date));
		}
		res.status(200).json({
			"attrs_for_follow_users": out
		});
	});

	app.get("/api/v1/user/:id/followers", async function(req, res) {
		const id = req.params["id"];
		const user = new User(id);
		if (await user.exists() === false) {
			res.status(404);
			return;
		}
		let out = [];
		const followers = await user.getFollowers();
		for (const follower of followers) {
			out.push(await socialUser(follower.user.id, follower.date));
		}
		res.status(200).json({
			"attrs_for_follow_users": out
		});
	});

	app.post("/api/v1/current_user/collected_payouts", async function(req, res) {
		let valid = validAuthToken(req, res, false);
		if (valid.ok === false) return;
		const user = valid.user;

		let pending = await user.getPendingPayouts();
		const payouts = req.body["payouts"];
		let totalCoins = await user.getCoins();

		for (const payout of payouts) {
			for (const i in pending) {
				let pendingPayout = pending[i];
				if (pendingPayout["ref_id"] == payout["ref_id"]) {
					totalCoins += pendingPayout.coin_grants;
					pending.splice(i, 1);
				}
			}
		}

		await user.setCoins(totalCoins);
		await user.setPendingPayouts(pending);
		res.status(200).json({
			"attrs_for_current_user": { coins: totalCoins }
		});
	});

	app.get("/api/v1/current_user/pending_payouts", async function(req, res) {
		let valid = validAuthToken(req, res, false);
		if (valid.ok === false) return;
		
		res.status(200).json({
			"pending_payouts": await valid.user.getPendingPayouts()
		})
	});

	app.get("/api/v1/current_user/deleted_worlds", function(req, res) {
		let valid = validAuthToken(req, res, false);
		if (valid.ok === false) return;

		res.status(200).json({
			"worlds": []
		});
	});

	app.get("/api/v1/users/:id/liked_worlds", async function(req, res) {
		const id = req.params["id"];
		const user = new User(id);
		if (await user.exists() === false) {
			res.status(404).json({ error: "404", error_msg: "user does not exists" });
			return;
		}
		const worlds = await user.getLikedWorlds();
		let worldMetadatas = [];
		for (let world of worlds) {
			if (world != null) {
				const fWorld = await fullWorldSync(world, true);
				if (fWorld == null) continue;
				worldMetadatas.push(fWorld);
			}
		}
		res.status(200).json({
			"worlds": worldMetadatas
		});
	});

	app.get("/api/v1/users/:id/basic_info", basic_info);
}
