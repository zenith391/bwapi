const fs = require("fs");

fs.readFile("./blocks_pricings_org.json", function(err, data) {
	let org = JSON.parse(data);
	let ids = [];
	for (i in org["block_items_pricing"]) {
		let item = org["block_items_pricing"][i];
		ids.push(item["block_item_id"]);
	}

	let blockItems = [];
	for (i in ids) {
		let blockItem = {
			"block_item_id": parseInt(i),
			"gold_pennies": 0,
			"is_coins_value_flat_rate": false,
			"a_la_carte_stack_price": 0,
			"a_la_carte_stack_size": 1
		};
		blockItems.push(blockItem);
	}

	fs.writeFile("./blocks_pricings.json", JSON.stringify({
		"block_items_pricing": blockItems,
		"last_update_timestamp": Math.floor(new Date().getTime()/1000)
	}), function(err) {
		if (err) {
			console.log("Could not save to file.");
		}
	});
});
