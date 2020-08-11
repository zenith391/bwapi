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
		fs.readdir("conf/news_articles", function(err, files) {
			files = files.map(function (fileName) {
				return {
					name: fileName,
					time: fs.statSync("conf/news_articles/" + fileName).mtimeMs
				}
			}).sort(function (a, b) {
				return b.time - a.time;
			}).map(function(v) {
				return v.name;
			});
			if (!fs.existsSync("users/"+userId)) {
				res.status(404);
				return;
			}
			for (i=0; i < files.length; i++) {
				let file = files[i];
				//newsFeed.push(fs.readFileSync("conf/news_articles/" + file, {"encoding": "utf8"}));
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
	});
};