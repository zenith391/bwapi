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
