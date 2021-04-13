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
import { User } from "./users.js";

export function run(app) {
	app.get("/api/v1/user/:id/recent_activity", async function(req, res) {
		const id = req.params["id"];
		const user = new User(id);

		if (await user.exists()) {
			const username = await user.getUsername();
			const profileImageURL = await user.getProfileImageURL();

			const feeds = await user.getFeeds();
			let lastDate = new Date(0);
			let newsFeed = [];
			for (let feed of feeds) {
				feed["follow_target_id"] = parseInt(id);
				feed["follow_target_username"] = username;
				feed["follow_target_profile_image_url"] = profileImageURL;
				if (feed.timestamp) {
					let d = new Date(feed.timestamp);
					if (d.getTime() > lastDate.getTime()) {
						lastDate = d;
					}
				}
				newsFeed.push(JSON.stringify(feed));
			}
			res.status(200).json({
				"user_activity": newsFeed,
				"subscription_tier": 0,
				"followers_count": 0,
				"last_transaction_at": dateString(lastDate)
			});
		}
	});

	app.get("/api/v1/current_user/news_feed", async function(req, res) {
		let valid = validAuthToken(req, res);
		if (valid.ok === false) return;

		let userId = valid.user.id;
		let newsFeed = [];
		let followedUsers = [];

		if (!fs.existsSync("users/" + userId + "/followed_users.json")) {
			fs.writeFileSync("users/" + userId + "/followed_users.json", "{\"attrs_for_follow_users\":{}}");
		}
		let json = JSON.parse(fs.readFileSync("users/"+userId+"/followed_users.json"))["attrs_for_follow_users"];
		for (const i in json) {
			if (json[i] != undefined) {
				followedUsers.push(i.substring(1));
			}
		}
		followedUsers.push(userId);

		for (const id of followedUsers) {
			let feeds = await valid.user.getFeeds();
			for (let feed of feeds) {
				feed["follow_target_id"] = valid.user.id;
				feed["follow_target_username"] = metadata["username"];
				feed["follow_target_profile_image_url"] = metadata["profile_image_url"];
				newsFeed.push(JSON.stringify(feed));
			}
		}

		newsFeed.sort(function(a, b) {
			var dateA = new Date(JSON.parse(a).timestamp);
			var dateB = new Date(JSON.parse(b).timestamp);
			if (isNaN(dateA.getTime())) dateA = new Date(0);
			if (isNaN(dateB.getTime())) dateB = new Date(0);
			return dateA.getTime() < dateB.getTime() ? 1 : -1;
		});

		res.status(200).json({
			"news_feed": newsFeed
		});
	});
};