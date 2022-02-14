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

// TODO: dans worlds.ts, rajouter un query ?highres ?lowres, etc. ou alors ?width=440&height=440
// pour choisir la taille de l'image, et la redimensionner puis compresser dans l'endpoint
// permet d'économiser la bande passante et de rendre le chargement plus rapide
import fs from "fs";
import url from "url";
import uuid from "uuid";
import util from "util";
import config from "./config.js";
import { value2, validAuthToken, dateString, cloneArray } from "./util.js";
import classTransformer from "class-transformer";

type Payout = {
	payout_type: string;
	coin_grants: number;
	title: string;
	msg1?: string;
	msg2?: string;
	ref_id?: number;
	has_gold_border: boolean;
};

enum AccountType {
	User = "user",
	Group = "group"
};

enum LinkType {
	Wool = 1024,
	iOS = 256 | 512
};

type UserMetadata = {
	id: number;
	username: string | null;
	is_username_blocked: boolean;
	is_image_locked: boolean;
	profile_image_url: string;
	user_status: number;
	account_type: AccountType;
	blocksworld_premium: number;
	coins: number;

	// iOS related
	game_gems: number;
	needs_tutorial: boolean;
	purchased_building_set_ids: number[];
	agreed_to_tos: boolean;
	agreed_to_u2u_tos: boolean;
	spinner1_unlocked: boolean;
	spinner2_unlocked: boolean;

	// iOS link related
	ios_link_available: boolean;
	ios_link_initiated: boolean;

	_SERVER_worlds: number[];
	_SERVER_models: number[];
	_SERVER_groups: number[];
};

const defaultMetadata: UserMetadata = {
	id: 0,
	username: null,
	is_username_blocked: false,
	is_image_locked: false,
	profile_image_url: "",
	user_status: 0,
	account_type: AccountType.User,
	blocksworld_premium: 0,
	coins: 100,

	game_gems: 0,
	needs_tutorial: true,
	purchased_building_set_ids: [123789456],
	agreed_to_tos: false,
	agreed_to_u2u_tos: false,
	spinner1_unlocked: true,
	spinner2_unlocked: false,

	ios_link_available: false,
	ios_link_initiated: false,

	_SERVER_worlds: [],
	_SERVER_models: [],
	_SERVER_groups: []
}

type FollowUser = {
	user: User;
	date: Date;
};

export class User {
	readonly id: number;
	private _pendingPayouts?: Payout[];
	private _metadata?: UserMetadata;
	private _followers?: FollowUser[];
	private _followedUsers?: FollowUser[];
	private _purchasedModels?: number[];
	private _feeds?: any[]; // TODO: fix type
	private _likedWorlds?: number[];

	static status = {
		premium: 1,
		steam: 2,
		earlyAccess: 4,
		moderator: 8,
		// Is official Linden account
		linden: 16,
		// Has tier 1 premium membership
		tier1: 32,
		// Has tier 2 premium membership
		tier2: 64,
		// Has tier 3 premium membership
		tier3: 128,
		// Using an iPad
		ipad: 256,
		// Using an iPhone
		iphone: 512,
		// Using any iOS device
		ios: 256 | 512,
		// Using a Blocksworld Wool account (unofficial, only used by bots and marking)
		launcher: 1024
	};

	constructor(id: string | number) {
		if (typeof id === "string") {
			if (isNaN(parseInt(id))) {
				throw "Invalid user identifier";
			}
			this.id = parseInt(id);
		} else {
			this.id = id;
		}
	}

	static async create(username: string, linkType: LinkType) {
		const newId = fs.readFileSync("conf/new_account_id.txt", {"encoding": "utf8"});
		fs.writeFileSync("conf/new_account_id.txt", (parseInt(newId)+1).toString());

		console.log("Creating user with ID " + newId);
		fs.mkdirSync("users/"+newId);
		let newUserStatus: number = linkType;
		if (config.EARLY_ACCESS)
			newUserStatus |= 4; // add "early access" flag
		let userInfo = {
			"coins": 100,
			"game_gems": 0,
			"needs_tutorial": true,
			"purchased_building_set_ids": [123789456],
			"agreed_to_tos": false,
			"agreed_to_u2u_tos": false,
			"spinner1_unlocked": true,
			"spinner2_unlocked": false,
			"ios_link_available": false,
			"ios_link_initiated": false,
			"is_username_blocked": false,
			"profile_image_url": config.HOST + "/images/categories/default_pfp.png",
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

	async addPayout(payout: Payout) {
		let payouts = await this.getPendingPayouts();
		if (!Array.isArray(payouts)) {
			payouts = [];
		}

		let nextId = 0;
		for (const i in payouts) {
			nextId = Math.max(nextId, parseInt(i)+1);
		}
		payout["ref_id"] = nextId+1;
		payouts.push(payout);
		this.setPendingPayouts(payouts);
	}

	async exists() {
		return fs.existsSync("users/" + this.id);
	}

	async getMetadata() {
		if (this._metadata === undefined) {
			let metadataJson = JSON.parse(fs.readFileSync("users/" + this.id + "/metadata.json", { encoding: "utf8" }));
			let metadata = classTransformer.plainToClassFromExist(defaultMetadata, metadataJson);
			metadata.id = this.id; // enforce id number
			this._metadata = metadata;
		}
		return Object.assign({}, this._metadata!);
	}

	async getFollowers() {
		if (this._followers === undefined) {
			if (!fs.existsSync("users/" + this.id + "/followers.json")) {
				fs.writeFileSync("users/" + this.id + "/followers.json", "{\"attrs_for_follow_users\":{}}");
			}

			const rawFollowers = JSON.parse(fs.readFileSync("users/" + this.id + "/followers.json", { encoding: "utf8" }))["attrs_for_follow_users"];
			this._followers = [];
			for (const i in rawFollowers) {
				if (rawFollowers[i] != undefined) {
					this._followers.push({
						user: new User(i.substring(1)),
						date: new Date(rawFollowers[i])
					})
				}
			}
		}
		return cloneArray(this._followers!);
	}

	async getFollowedUsers() {
		if (this._followedUsers === undefined) {
			if (!fs.existsSync("users/" + this.id + "/followed_users.json")) {
				fs.writeFileSync("users/" + this.id + "/followed_users.json", "{\"attrs_for_follow_users\":{}}");
			}

			const rawFollowedUsers = JSON.parse(fs.readFileSync("users/" + this.id + "/followed_users.json", { encoding: "utf8" }))["attrs_for_follow_users"];
			this._followedUsers = [];
			for (const i in rawFollowedUsers) {
				if (rawFollowedUsers[i] != undefined) {
					this._followedUsers.push({
						user: new User(i.substring(1)),
						date: new Date(rawFollowedUsers[i])
					})
				}
			}
		}

		return cloneArray(this._followedUsers!);
	}

	async getPendingPayouts() {
		if (this._pendingPayouts === undefined) {
			this._pendingPayouts = JSON.parse(fs.readFileSync("users/" + this.id + "/pending_payouts.json", { encoding: "utf8" }))["pending_payouts"];
		}

		return cloneArray(this._pendingPayouts!);
	}

	async getPurchasedModels() {
		if (this._purchasedModels === undefined) {
			if (!fs.existsSync("users/" + this.id + "/purchased_u2u_models.json")) {
				fs.writeFileSync("users/" + this.id + "/purchased_u2u_models.json", "{\"u2u_models\":[]}");
			}
			this._purchasedModels = JSON.parse(fs.readFileSync("users/" + this.id + "/purchased_u2u_models.json", { encoding: "utf8" }))["u2u_models"];
		}

		return cloneArray(this._purchasedModels!);
	}

	async getFeeds() {
		if (this._feeds === undefined) {
			if (!fs.existsSync("users/" + this.id + "/news_feed.json")) {
				fs.writeFileSync("users/" + this.id + "/news_feed.json", "{\"news_feed\":[]}");
			}
			this._feeds = JSON.parse(fs.readFileSync("users/" + this.id + "/news_feed.json", { encoding: "utf8" }))["news_feed"];
		}
		return cloneArray(this._feeds!);
	}

	async getLikedWorlds(): Promise<number[]> {
		if (this._likedWorlds === undefined) {
			if (!fs.existsSync("users/" + this.id + "/liked_worlds.json")) {
				fs.writeFileSync("users/" + this.id + "/liked_worlds.json", "{\"worlds\":[]}");
			}
			this._likedWorlds = JSON.parse(fs.readFileSync("users/" + this.id + "/liked_worlds.json", { encoding: "utf8" }))["worlds"];
		}
		return cloneArray(this._likedWorlds!);
	}

	async appendPurchasedModel(modelId: any) {
		let purchasedModels = await this.getPurchasedModels();
		purchasedModels.push(modelId);
		fs.writeFileSync("users/" + this.id + "/purchased_u2u_models.json", JSON.stringify({
			u2u_models: purchasedModels
		}));
	}

	async addFeed(feed: any) {
		feed.timestamp = dateString();

		let newsFeed = await this.getFeeds();
		newsFeed.unshift(feed);
		await this.setFeeds(newsFeed);
	}

	async follow(target: any) {
		const targetId = target.id;
		let user = JSON.parse(fs.readFileSync("users/"+this.id+"/followed_users.json", { encoding: "utf8" }));
		let targetFollowers: any;
		if (fs.existsSync("users/"+targetId+"/followers.json")) {
			targetFollowers = JSON.parse(fs.readFileSync("users/"+targetId+"/followers.json", { encoding: "utf8" }))
		} else {
			// res.status(404).json({
			// 	"error": "the target doesn't exists"
			// });
			console.error("the target doesn't exists");
			return;
		}
		user["attrs_for_follow_users"]["u"+targetId] = dateString();
		targetFollowers["attrs_for_follow_users"]["u"+this.id] = dateString();
		fs.writeFile("users/"+this.id+"/followed_users.json", JSON.stringify(user), function(err) {
			if (err) console.error(err);
			fs.writeFile("users/"+targetId+"/followers.json", JSON.stringify(targetFollowers), function(err) {
				if (err) console.error(err);
			});
		});
	}

	async setMetadata(newValue: UserMetadata) {
		this._metadata = newValue;
		fs.writeFileSync("users/" + this.id + "/metadata.json", JSON.stringify(newValue));
	}

	async setFollowers(newValue: FollowUser[]) {
		this._followers = newValue;

		let obj: any = {};
		for (const follower of newValue) {
			obj["u" + follower.user.id] = dateString(follower.date);
		}

		fs.writeFileSync("users/" + this.id + "/followers.json", JSON.stringify({
			attrs_for_follow_users: obj
		}));
	}

	async setFollowedUsers(newValue: FollowUser[]) {
		this._followedUsers = newValue;

		let obj: any = {};
		for (const followed of newValue) {
			obj["u" + followed.user.id] = dateString(followed.date);
		}

		fs.writeFileSync("users/" + this.id + "/followed_users.json", JSON.stringify({
			attrs_for_follow_users: obj
		}));
	}

	async setPendingPayouts(newValue: Payout[]) {
		this._pendingPayouts = newValue;
		fs.writeFileSync("users/" + this.id + "/pending_payouts.json", JSON.stringify({
			pending_payouts: newValue
		}));
	}

	async setFeeds(newValue: any) {
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

	async appendOwnedWorld(worldId: number) {
		let metadata = await this.getMetadata();
		metadata["_SERVER_worlds"].push(worldId);
		await this.setMetadata(metadata);
	}

	async appendOwnedModel(modelId: number) {
		let metadata = await this.getMetadata();
		metadata["_SERVER_models"].push(modelId);
		await this.setMetadata(metadata);
	}

	async getCoins() {
		return (await this.getMetadata()).coins;
	}

	async getUsername() {
		const username = (await this.getMetadata()).username;
		if (username === undefined) return null;
		return username;
	}

	async getStatus() {
		return (await this.getMetadata()).user_status;
	}

	async hasAgreedToToS() {
		return (await this.getMetadata()).agreed_to_tos;
	}

	async hasAgreedToU2UToS() {
		return (await this.getMetadata()).agreed_to_u2u_tos;
	}

	async isBanned() {
		return (await this.getMetadata()).is_username_blocked;
	}

	async getAccountType() {
		const metadata = await this.getMetadata();
		if (metadata["account_type"] === undefined) return "user";
		return metadata["account_type"];
	}

	async setCoins(newValue: number) {
		let metadata = await this.getMetadata();
		metadata.coins = newValue;
		await this.setMetadata(metadata);
	}

	async setUsername(newValue: string) {
		let metadata = await this.getMetadata();
		metadata.username = newValue;
		await this.setMetadata(metadata);
	}

	async setStatus(newValue: number) {
		let metadata = await this.getMetadata();
		metadata.user_status = newValue;
		await this.setMetadata(metadata);
	}

	async agreeToToS() {
		let metadata = await this.getMetadata();
		metadata.agreed_to_tos = true;
		await this.setMetadata(metadata);
	}

	async agreeToU2UToS() {
		let metadata = await this.getMetadata();
		metadata.agreed_to_u2u_tos = true;
		await this.setMetadata(metadata);
	}

	async completeTutorial() {
		let metadata = await this.getMetadata();
		metadata.needs_tutorial = false;
		await this.setMetadata(metadata);
	}

	async ban() {
		let metadata = await this.getMetadata();
		metadata.is_username_blocked = true;
		await this.setMetadata(metadata);
	}

	async unban() {
		let metadata = await this.getMetadata();
		metadata.is_username_blocked = false;
		await this.setMetadata(metadata);
	}

}

User.status = {
	premium: 1,
	steam: 2,
	earlyAccess: 4,
	moderator: 8,
	// Is official Linden account
	linden: 16,
	// Has tier 1 premium membership
	tier1: 32,
	// Has tier 2 premium membership
	tier2: 64,
	// Has tier 3 premium membership
	tier3: 128,
	// Using an iPad
	ipad: 256,
	// Using an iPhone
	iphone: 512,
	// Using any iOS device
	ios: 256 | 512,
	// Using a Blocksworld Wool account (unofficial, only used by bots and marking)
	launcher: 1024
};

type SocialUser = {
	user_id: number;
	username: string | null;
	user_status: number;
	user_blocksworld_premium: number;
	started_following_at: string;
	profile_image_url: string;
	relationship: number;
};

export async function socialUser(id: number, date: Date): Promise<SocialUser> {
	const user = new User(id);
	const metadata = await user.getMetadata();
	return {
		"user_id": id,
		"username": metadata.username,
		"user_status": metadata["user_status"],
		"user_blocksworld_premium": metadata["user_status"],
		"started_following_at": dateString(date),
		"profile_image_url": metadata["profile_image_url"],
		"relationship": 1
	}
}

// Module code //
async function basic_info(req: any, res: any) {
	const userId = req.params.id;
	const user = new User(userId);
	if (!await user.exists()) {
		res.status(404).json({
			"error": 404,
			"error_msg": "user not found."
		});
		return;
	}

	const metadata = await user.getMetadata();
	let json: any = {
		"id": metadata.id,
		"username": metadata.username,
		"is_username_blocked": metadata.is_username_blocked,
		"is_image_locked": metadata.is_image_locked,
		"user_status": metadata.user_status,
		"account_type": metadata.account_type,
		"blocksworld_premium": metadata.blocksworld_premium,
		"profile_image_url": metadata.profile_image_url,
		"coins": metadata.coins
	}
	if (metadata["account_type"] == "group") {
		json["worlds_ids"] = metadata["_SERVER_worlds"];
		// json["owner_id"] = metadata["owner_id"];
		// let members = [];
		// for (const id of metadata["members"]) {
		// 	const member = new User(id);
		// 	members.push(await member.getUsername());
		// }
		// json["members_usernames"] = members;
		// json["members_ids"] = metadata["members"];
	}
	res.status(200).json(json);
}

async function save_current_user_profile_world(req: any, res: any) {
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
				"author_id": userId,
				"image_urls_for_sizes": {},
				"profile_gender": "unknown",
				"updated_at_timestamp": Date.now()
			}));
	}
	let meta = JSON.parse(fs.readFileSync("users/"+userId+"/profile_world/metadata.json", { encoding: "utf8" }));
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
		if (req.files && req.files["profile_image"]) {
			fs.copyFileSync(req.files["profile_image"][0].path, "images/profiles/"+userId+".jpg");
			userMeta["profile_image_url"] = "https://bwsecondary.ddns.net:8080/images/profiles/"+userId+".jpg";
			fs.writeFileSync("users/"+userId+"/metadata.json", JSON.stringify(userMeta));
		}
	}
	await valid.user.setMetadata(userMeta);

	res.status(200).json(userMeta);
}

async function current_user_profile_world(req: any, res: any) {
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
				"author_id": userId,
				"image_urls_for_sizes": {},
				"profile_gender": "unknown",
				"updated_at_timestamp": Date.now()
			}));
	}

	let src = fs.readFileSync("users/"+userId+"/profile_world/source.json",{"encoding":"utf8"});
	let meta = JSON.parse(fs.readFileSync("users/"+userId+"/profile_world/metadata.json", { encoding: "utf8" }));
	meta["image_url"] = await valid.user.getProfileImageURL();
	meta["source_json_str"] = src
	if (fs.existsSync("users/"+userId+"/profile_world/avatar_source.json")) {
		meta["avatar_source_json_str"] = fs.readFileSync("users/"+userId+"/profile_world/avatar_source.json",{"encoding":"utf8"});
	}
	meta = (global as any).processUserWorld(meta)
	res.status(200).json(meta);
}

async function current_user_worlds(req: any, res: any) {
	const is_published = url.parse(req.url, true).query.is_published
	const valid = validAuthToken(req, res, false);
	if (valid.ok === false) return;
	const user = valid.user;
	console.log("User " + user.id + " downloading his worlds.");
	let metadata = await user.getMetadata();
	const ownedWorlds = await user.getOwnedWorlds();

	console.log("User " + user.id + " owned worlds: " + util.inspect(ownedWorlds, { colors: true }));

	let response: any = metadata;
	response.worlds = [];
	response["_SERVER_worlds"] = undefined;
	response["_SERVER_models"] = undefined;
	response["_SERVER_groups"] = undefined;
	for (const id of ownedWorlds) {
		try {
			const retrievedWorld = await (global as any).fullWorldSync(id, true);
			if (retrievedWorld !== null) {
				if (is_published == "yes") {
					if (retrievedWorld.publication_status == 1) {
						response.worlds.push(retrievedWorld);
					}
				} else {
					response.worlds.push(retrievedWorld);
				}
			}
		} catch (e) {
			console.debug(e);
			console.error("could not retrieve worlds for user " + user.id + "!");
			res.status(200).json({
				"error": 404,
				"error_msg": "Could not load your worlds."
			});
		}
	}

	console.log("User " + user.id + " worlds: " + util.inspect(response.worlds, { colors: true }));

	res.status(200).json(response);
}

async function current_user_worlds_for_teleport(req: any, res: any) {
	let valid = validAuthToken(req, res, false);
	if (valid.ok === false) return;
	const ownedWorlds = await valid.user.getOwnedWorlds()
	let worlds = [];
	for (const id of ownedWorlds) {
		try {
			let world = await (global as any).fullWorldSync(id, true);
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

function follow(req: any, res: any) {
	let valid = validAuthToken(req, res, false);
	if (valid.ok === false) return;
	let userId = valid.user.id;
	let targetId = parseInt(req.params["id"]);
	let user = JSON.parse(fs.readFileSync("users/"+userId+"/followed_users.json", { encoding: "utf8" }));
	let target: any;
	if (fs.existsSync("users/"+targetId+"/followers.json")) {
		target = JSON.parse(fs.readFileSync("users/"+targetId+"/followers.json", { encoding: "utf8" }))
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

function unfollow(req: any, res: any) {
	let valid = validAuthToken(req, res, false);
	if (valid.ok === false) return;
	let userId = valid.user.id;
	let targetId = parseInt(req.params["id"]);
	let user = JSON.parse(fs.readFileSync("users/"+userId+"/followed_users.json", { encoding: "utf8" }));
	let target: any;
	if (fs.existsSync("users/"+targetId+"/followers.json")) {
		target = JSON.parse(fs.readFileSync("users/"+targetId+"/followers.json", { encoding: "utf8" }))
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

export function run(app: any) {
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

	app.get("/api/v1/user/:id/followed_users", async function(req: any, res: any) {
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

	app.get("/api/v1/user/:id/followers", async function(req: any, res: any) {
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

	app.post("/api/v1/current_user/collected_payouts", async function(req: any, res: any) {
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
					pending.splice(parseInt(i), 1);
				}
			}
		}

		await user.setCoins(totalCoins);
		await user.setPendingPayouts(pending);
		res.status(200).json({
			"attrs_for_current_user": { coins: totalCoins }
		});
	});

	app.get("/api/v1/current_user/pending_payouts", async function(req: any, res: any) {
		let valid = validAuthToken(req, res, false);
		if (valid.ok === false) return;
		
		res.status(200).json({
			"pending_payouts": await valid.user.getPendingPayouts()
		})
	});

	app.get("/api/v1/current_user/deleted_worlds", function(req: any, res: any) {
		let valid = validAuthToken(req, res, false);
		if (valid.ok === false) return;

		res.status(200).json({
			"worlds": []
		});
	});

	app.get("/api/v1/users/:id/liked_worlds", async function(req: any, res: any) {
		const id = req.params["id"];
		const user = new User(id);
		if (await user.exists() === false) {
			res.status(404).json({ error: "404", error_msg: "user does not exists" });
			return;
		}
		const worlds = await user.getLikedWorlds();
		let worldMetadatas = [];
		for (const world of worlds) {
			if (world != null) {
				const fWorld = await (global as any).fullWorldSync(world, true);
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
