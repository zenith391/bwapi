## Configuration
`user_block_inventory.txt` refers to the block inventory everyone haves (as one of my value is to make everyone have the same blocks). It defaults to having every block possible (including non production-ready blocks), you can change it,
for example you can copy `demo_user_block_inventory.txt` to `user_block_inventory.txt` and have everyone use the demo block inventory (the blocks available in demo mode).

`app_remote_configuration.json` is the remote configuration used by Blocksworld: it contains cooldown times and low effort GAF count (you don't need to know/edit that file)

`new_world_id.txt`; `new_model_id.txt`; `new_account_id.txt` are the next world ID, model ID and account ID respectively, to be used and MUST NOT be changed manually.

`blocks_pricings.json` is the prices of the blocks on the Shop.

`coin_packs.json` are the available coin packs. You should not change as they are directly linked to Steam iAPs.

`content_categories.json` the content (world and models) available categories.

`default_profile_world.txt` contains data about the default world for profile pic.

## World Templates
World templates are in the `world_templates` folder, if you want to add one you will need some knowledge
about how Blockworld works, if you do then just copy an existing template to a new one (don't use space, use underscore (`_`)), copy your world's `source.json` to the new template's `source.json` and edit template's `metadata.json` as you wish.