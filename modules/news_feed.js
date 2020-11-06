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

const fs = require("fs");

addFeed = function(userId, feed) {
	if (!fs.existsSync("users/" + userId + "/news_feed.json")) {
		fs.writeFileSync("users/" + userId + "/news_feed.json", "{\"news_feed\":[]}");
	}
	let newsFeed = JSON.parse(fs.readFileSync("users/"+userId+"/news_feed.json"));
	newsFeed["news_feed"].unshift(feed);
	fs.writeFileSync("users/"+userId+"/news_feed.json", JSON.stringify(newsFeed));
}

module.exports.run = function(app) {
	app.get("/api/v1/user/:id/recent_activity", function(req, res) {
		let newsFeed = [];
		let id = req.params["id"];
		if (fs.existsSync("users/" + id)) {
			if (!fs.existsSync("users/" + id + "/news_feed.json")) {
				fs.writeFileSync("users/" + id + "/news_feed.json", "{\"news_feed\":[]}");
			}
			let meta = userMetadata(id);
			let feeds = JSON.parse(fs.readFileSync("users/"+id+"/news_feed.json"));
			let lastDate = new Date(0);
			for (i in feeds["news_feed"]) {
				let feed = feeds["news_feed"][i];
				feed["follow_target_id"] = parseInt(id);
				feed["follow_target_username"] = meta["username"];
				feed["follow_target_profile_image_url"] = meta["profile_image_url"];
				if (feed["timestamp"]) {
					let d = new Date(feed["timestamp"]);
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

	app.get("/api/v1/current_user/news_feed", function(req, res) {
		let valid = validAuthToken(req, res);
		if (!valid[0]) {
			return;
		}
		let userId = valid[1];
		let meta = userMetadata(userId);
		let newsFeed = [];
		if (!fs.existsSync("users/"+userId)) {
			res.status(404);
			return;
		}
		if (!fs.existsSync("users/" + userId + "/news_feed.json")) {
			fs.writeFileSync("users/" + userId + "/news_feed.json", "{\"news_feed\":[]}");
		}
		let feeds = JSON.parse(fs.readFileSync("users/"+userId+"/news_feed.json"));
		for (i in feeds["news_feed"]) {
			let feed = feeds["news_feed"][i];
			feed["follow_target_id"] = userId;
			feed["follow_target_username"] = meta["username"];
			feed["follow_target_profile_image_url"] = meta["profile_image_url"];
			newsFeed.push(JSON.stringify(feed));
		}
		res.status(200).json({
			"news_feed": newsFeed
		});
	});
};