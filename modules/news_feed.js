import { User } from "./users.js";
export function run(app) {
    app.get("/api/v1/user/:id/recent_activity", async function (req, res) {
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
            const followers = await user.getFollowers(); // TODO: only take the count
            res.status(200).json({
                "user_activity": newsFeed,
                "subscription_tier": 0,
                "followers_count": followers.length,
                "last_transaction_at": dateString(lastDate)
            });
        }
    });
    app.get("/api/v1/current_user/news_feed", async function (req, res) {
        const valid = validAuthToken(req, res);
        if (valid.ok === false)
            return;
        const userId = valid.user.id;
        let newsFeed = [];
        let followedUsers = await valid.user.getFollowedUsers();
        followedUsers.push({ user: valid.user });
        for (const followed of followedUsers) {
            const feeds = await followed.user.getFeeds();
            for (let feed of feeds) {
                feed["follow_target_id"] = followed.user.id;
                feed["follow_target_username"] = await followed.user.getUsername();
                feed["follow_target_profile_image_url"] = await followed.user.getProfileImageURL();
                newsFeed.push(JSON.stringify(feed));
            }
        }
        newsFeed.sort(function (a, b) {
            var dateA = new Date(JSON.parse(a).timestamp);
            var dateB = new Date(JSON.parse(b).timestamp);
            if (isNaN(dateA.getTime()))
                dateA = new Date(0);
            if (isNaN(dateB.getTime()))
                dateB = new Date(0);
            return dateA.getTime() < dateB.getTime() ? 1 : -1;
        });
        res.status(200).json({
            "news_feed": newsFeed
        });
    });
}
;
