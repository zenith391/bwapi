#!/usr/bin/python

f = open("user_block_inventory.txt", "w")
s = ""
for i in range(5389):
	s = s + str(i) + ":;1"
	if (i < 5388):
		s = s + "|"

f.write(s)
f.close()
