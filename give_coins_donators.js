const fs = require("fs");
const donators = JSON.parse(fs.readFileSync("donators.json"))["donators"];

fs.readdir("users", function(err, files) {
	for (k in files) {
		let id = files[k];
		if (!isNaN(parseInt(id))) {
			let meta = JSON.parse(fs.readFileSync("users/" + id + "/metadata.json"));
			if (donators.includes(meta["username"])) {
				console.log("Give coins to " + meta["username"] + " (id = " + id + ")");
				let nextId = 0;
				let payout = {
					"payout_type": "coins",
					"coin_grants": 50,
					"title": "Weekly donator coins",
					"message1": "Thanks for donating, here are you weekly coins!",
					"hasGoldBorder": true
				};
				let payouts = JSON.parse(fs.readFileSync("users/"+id+"/pending_payouts.json"));
				for (i in payouts["pending_payouts"]) {
					nextId = Math.max(nextId, i+1);
				}
				if (!Array.isArray(payouts["pending_payouts"])) {
					console.log(meta["username"] + " was unable to get payouts.");
					payouts["pending_payouts"] = [];
				}
				payout["ref_id"] = nextId+1;
				payouts["pending_payouts"].push(payout);
				fs.writeFileSync("users/"+id+"/pending_payouts.json", JSON.stringify(payouts));
			}
		}
	}
});
