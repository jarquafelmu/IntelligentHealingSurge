/**
 * Intelligent Healing Surge
 * 
 * Based on the Dnd Fifth Edition healing surge variant, this script allows a user to quickly perform a healing surge
 * while ensuring that a healing surge can actually be performed.
*/

var IntelligentHealingSurge = IntelligentHealingSurge ||
(function() {
	"use strict";

	// ReSharper disable once UnusedLocals
	/**
	 * Script information
	 */
	const info = Object.freeze({
		version: "0.1.0",
		created: "5/6/2017",
		lastupdate: "5/9/2017",
		author: "Sam T."
	});

	/**
	 * Useful constants for defining certain parts of the code
	 */
	const fields = Object.freeze({
		apiInvoke: "ihs",
		feedbackName: "Intelligent Healing Surge",
		commands: {
			surge: "surge",
			shortRest: "short",
			longRest: "long",
			exhaust: "exhaust",
			initialize: "initialize"
		}
	});

	const friendlyAttributeNames = Object.freeze({
		conMod: "constitution",
		hitDice: "hit_dice",
		healingSurge: "healingSurge",
		hitDie: "hitdietype",
		hp: "hp",
		level: "level"
	});

	const healingSurgeEnum = Object.freeze({
		READY: 1,
		NOTREADY: 0
	});

	const attributeTypeEnum = Object.freeze({
		CURRENT: "current",
		MAX: "max"
	});

	/**
	 * Send feedback
	 * 
	 * @param {string} msg	The message to send
	 * @param {string} name The a person who should be whispered instead, defaults to gm if
	 *                      left blank but if supplied null it will output to everyone [optional]
	 */
	var sendFeedback = function(msg, name) {
		if (name === undefined) {
			name = "gm";
		}

		let content = `${msg}`;
		content = name !== null ? `/w "${name}" ${content}` : content;

		sendChat(fields.feedbackName, content);
	};

	const sendEmote = function(characterid, msg) {
		sendChat(`character|${characterid}`, `/em ${msg}`);
	};

	/**
	 * Alert the GM that there has been an error
	 * 
	 * @param {string} msg The error message to send
	 */
	var sendError = function(msg, name) {
		msg = `<span style="color: red; font-weight: bold;">${msg}</span>`;

		if (name === undefined) {
			name = "gm";
			sendFeedback(msg, name);
		} else {
			sendFeedback(msg);
		}
	};

	/**
	 * Contains methods for telling special exceptions
	 */
	const exceptions = (function() {
		/**
		 * Exception is used if the character is at full health
		 * @param {any} message the message to send
		 */
		const fullHealthException = function(message) {
			this.message = message;
			this.name = "FullHealthException";
		};

		/**
		 * Exception is used when the api invoker has failed to select a valid token
		 * @param {any} message the message to send
		 */
		const selectionException = function(message) {
			this.message = message;
			this.name = "SelectionException";
		};

		/**
		 * Exception is used if a healing surge is tried to be used when it isn't ready
		 *
		 * @param {any} message the message to send
		 */
		const healingSurgeUnusableException = function(message) {
			this.message = message;
			this.name = "HealingSurgeUnusableException";
		};

		/**
		 * Exception is used if one tries to spend hit die when they have none
		 *
		 * @param {any} message the message to send
		 */
		const missingHitDiceException = function(message) {
			this.message = message;
			this.name = "MissingHitDiceException";
		};

		/**
		 * Exception is used when an attribute doesn't exist for a character.
		 * 
		 * @param {any} message the message to send
		 * @param {any} attribute the attribute that was missing
		 */
		const attributeDoesNotExistException = function(message, attribute) {
			this.message = message;
			this.attribute = attribute;
			this.name = "AttributeDoesNotExistException";
		};

		/**
		 * Exception is used when command restricted to GM level is invoked by a non-GM.
		 * 
		 * @param {any} message the message to send
		 */
		const restrictedAccessException = function(message) {
			this.message = message;
			this.name = "RestrictedAccessException";
		};
		return {
			/**
			 * Exception is used if the character is at full health
			 * @param {any} message the message to send
			 */
			FullHealthException: fullHealthException,

			/**
			 * Exception is used when an attribute doesn't exist for a character.
			 * @param {any} message the message to send
			 * @param {any} attribute the attribute that was missing
			 */
			AttributeDoesNotExistException: attributeDoesNotExistException,

			/**
			 * Exception is used when the api invoker has failed to select a valid token
			 * @param {any} message the message to send
			 */
			SelectionException: selectionException,

			/**
			 * Exception is used if one tries to spend hit die when they have none
			 * @param {any} message the message to send
			 */
			MissingHitDiceException: missingHitDiceException,

			/**
			 * Exception is used if a healing surge is tried to be used when it isn't ready
			 * @param {any} message the message to send
			 */
			HealingSurgeUnusableException: healingSurgeUnusableException,

			/**
			 * Exception is used when command restricted to GM level is invoked by a non-GM.
			 * 
			 * @param {any} message the message to send
			 */
			RestrictedAccessException: restrictedAccessException
		};
	}());

	/**
	 *  Contains templates which control how the look of the over all response looks
	 */
	const templates = (function() {
		/**
		 * Displays the text styled as a 5e description roll template
		 * @param {any} title
		 * @param {any} content
		 */
		const buildRollTemplate = function(title, content) {
			return `&{template:desc} {{desc=**${title}**<br>${content}}}`;
		};
		/**
		 * Creates a button for invoking an api command
		 * @param {any} label the button label
		 * @param {any} command the command for the button to invoke
		 */
		const buildButton = function(label, command) {
			return `[${label}](!${fields.apiInvoke} -${command})`;
		};
		return {
			buildRollTemplate: buildRollTemplate,
			buildButton: buildButton
		};
	}());

	/**
	 * Contains methods which deal with getting a character object from a token.
	 */
	const getJournal = (function() {
		/**
		 * Checks if a valid token exists in selection, returns first match.
		 * 
		 * @param {any} selection the selected object
		 *
		 * @return an object representing a token, otherwise null.
		 */
		var getTokenObj = function(selection) {
			var graphic;
			if (!selection ||
				selection.length !== 1 ||
				// ReSharper disable once UsageOfPossiblyUnassignedValue
				// ReSharper disable once QualifiedExpressionIsNull
				// ReSharper disable once PossiblyUnassignedProperty
				!(graphic = getObj("graphic", selection[0]._id) || graphic.get("_subtype") !== "token") ||
				graphic.get("isdrawing")) {
				throw new exceptions.SelectionException("A token must be selected before using this script.");
			}

			return getObj("graphic", selection[0]._id);
		};

		/**
		 * Gets the character journal object for which the token represents.
		 * 
		 * @param {any} selection The currently selected token
		 * @return the character journal if any is found, otherwise null.
		 */
		const getCharacterJournal = function(selection) {
			const curToken = getTokenObj(selection);
			if (!curToken) {
				return null;
			}

			const journal = getObj("character", curToken.get("represents"));
			if (journal) {
				const id = journal.get("_id");
				const name = journal.get("name");
				const isNpc = getAttrByName(id, "npc") === "1";

				return { name: name, id: id, isNpc: isNpc };
			}

			return null;
		};

		/**
		 * Checks to see if the Attribute exists for the NPC.
		 * 
		 * @param {any} id id of the journal to check
		 * @param {any} attribute npc attribute to check
		 *
		 * @return true if attribute exists, otherwise false.
		 */
		const useNpcAttributeName = function(id, attribute) {
			const result = parseInt(getAttrByName(id, `${attribute}_flag`));
			return result > 0;
		};

		/**
		 * Public functions
		*/
		return {
			getCharacterJournal: getCharacterJournal,
			useNpcAttributeName: useNpcAttributeName
		};
	}());

	/**
	 * Contains methods regarding working with the character
	 */
	// ReSharper disable once InconsistentNaming
	class Character {
		constructor(journalObj) {
			this.characterName = journalObj.name;

			this.characterid = journalObj.id;

			this.hp = parseInt(this.getAttr(friendlyAttributeNames.hp));

			this.maxHp = parseInt(this.getAttr(friendlyAttributeNames.hp, attributeTypeEnum.MAX));

			this.hitDice = parseInt(this.getAttr(friendlyAttributeNames.hitDice));

			this.maxHitDice = parseInt(this.getAttr(friendlyAttributeNames.hitDice, attributeTypeEnum.MAX));

			this.hitDie = parseInt(this.getAttr(friendlyAttributeNames.hitDie));

			try {
				this.healingSurge = parseInt(this.getAttr(friendlyAttributeNames.healingSurge));
			} catch (e) {
				if (e instanceof exceptions.AttributeDoesNotExistException) {
					// since the healingSurge attribute didn't exist, create it
					log("healing surge attribute not found, creating it now");
					this.setAttribute(friendlyAttributeNames.healingSurge, healingSurgeEnum.READY);
					this.healingSurge = healingSurgeEnum.READY;
				} else {
					sendError(JSON.stringify(e));
				}
			}

			this.conMod = this.processAttributeFormula(parseInt(this.getAttr(friendlyAttributeNames.conMod)));

			this.level = parseInt(this.getAttr(friendlyAttributeNames.level));
		}

		processAttributeFormula(attribute) {
			return Math.floor((attribute - 10) / 2);
		}

		/**
		 * Gets an attribute from a character
		 * 
		 * @param {any} characterid
		 * @param {any} name attribute name
		 * @param {any} type the attribute type, current or max. Defaults to current if undefined or null
		 * @throws AttributeDoesNotExistException If the character is missing the healing surge attribute then this exception is thrown
		 */
		getAttr(name, type) {
			if (type === undefined || type === null) {
				type = attributeTypeEnum.CURRENT;
			}

			const retval = getAttrByName(this.characterid, name, type);
			if (retval != null && retval !== "") {
				return retval;
			} else {
				throw new exceptions.AttributeDoesNotExistException(`Missing attribute`, name);
			}
		}

		/**
		 * Sets the specified attribute to a certain value, creating it first if necessary
		 * 
		 * @param {any} name the name of the attribute to be set
		 * @param {any} current the value the set the attribute
		 * @param {any} max [optional] the max value of the attribute (if any)
		 */
		setAttribute(name, current, max) {
			if (max === undefined || max === null) {
				max = "";
			}

			// find all attributes that share the same name
			const objs = findObjs({
				_type: "attribute",
				name: name,
				_characterid: `${this.characterid}`
			});

			// get the first one if it any were returned
			const obj = objs.length > 0 ? objs[0] : null;

			// ensure that obj actually contains an object
			if (obj !== undefined && obj !== null) {
				// set the value for current
				obj.set("current", current);

				// set the value for max if we have a max to set
				if (max !== "") obj.set("max", max);
			} else {
				// since no attribute existed for this name, create it
				createObj("attribute",
				{
					name: name,
					current: `${current}`,
					max: `${max}`,
					characterid: `${this.characterid}`
				});
			}
		}

		/**
		 * Determins how much is actually healed for any given hit die
		 * @param {any} hitDieMax
		 * @param {any} conMod
		 */
		computeHealAmt() {
			// use randomInteger(max) for rolling the hit dice
			return randomInteger(this.hitDie) + this.conMod;
		}


		/**
		 * Renews the use of a healing surge
		 */
		renewHealingSurge() {
			this.setAttribute(friendlyAttributeNames.healingSurge, healingSurgeEnum.READY);
		}

		/**
		 * Makes the healing surge unusable by the character until after they finish a short or long rest.
		 */
		exhaustHealingSurge() {
			sendEmote(this.characterid, "looks invigorated as a rush of energy flows through them.");
			this.setAttribute(friendlyAttributeNames.healingSurge, healingSurgeEnum.NOTREADY);
		}

		/**
		 * Checks if the healing surge is available
		 * @param {any} id the character id
		 */
		isHealingSurgeReady() {
			// check if the user's healing surge is ready
			return this.healingSurge === healingSurgeEnum.READY;

		}

		/**
		 * Verifies that the user has at least one hit die to spend.
		 * @param {any} id
		 */
		isHitDiceReady() {
			// checks if the user has more than 0 hit die
			return this.hitDice > 0;
		}

		/**
		 * Deterimes if the character is actually missing any hp.
		 * @returns true if hp is less than maxHp, otherwise false.
		 */
		isHurt() {
			return this.hp < this.maxHp;
		}

		/**
		 * Sets the currently available hit dice. This could increase or decrease what existed before
		 */
		updateHitDice() {
			this.setAttribute(friendlyAttributeNames.hitDice, this.hitDice);
		}

		/**
		 * Spends hit die to heal the character
		 * 
		 * @throws HealingSurgeUnusableException if the healing surge is already used
		 * @throws FullHealthException if the character is at full health
		 * @throws MissingHitDiceException if there are no more hit die to use
		 */
		spendHitDieToHeal() {
			// Healing surge gate
			if (!this.isHealingSurgeReady()) {
				throw new exceptions.HealingSurgeUnusableException("You must rest before you can use this feature again.");
			}

			// Health gate
			if (!this.isHurt()) {
				throw new exceptions.FullHealthException("You are at full health already.");
			}

			// enough hit dice gate
			if (!this.isHitDiceReady()) {
				throw new exceptions.MissingHitDiceException("You are out of hit dice to spend.");
			}

			// reduce the hit dice by one
			this.hitDice--;

			// update the hit dice on the character sheet
			this.updateHitDice();

			// compute how much health is healed
			return this.computeHealAmt();
		}

		/**
		 * Display how much was healed to the user
		 * @param {any} healAmt
		 * @param {any} sender
		 */
		displayHealAmt(healAmt, sender) {
			const content = templates.buildRollTemplate("Healing Surge",
				`Healed up to [[${healAmt - this.conMod} + ${this.conMod}]] hp.`);
			sendFeedback(content, sender);
		}

		/**
		 * Updates the character's hp
		 * @param {any} healAmount
		 */
		updateHp(healAmount) {
			this.hp = Math.min(healAmount + this.hp, this.maxHp);
			this.setAttribute(friendlyAttributeNames.hp, this.hp);
		}

		/**
		 * Confirm if the user wishes to spend another hit die
		 * @param {any} sender
		 */
		queryContinue(sender) {
			const buttons = `${templates.buildButton("Yes", "surge")} ${templates.buildButton("No", "exhaust")}`;
			const content = templates.buildRollTemplate("Use another?", buttons);
			sendFeedback(content, sender);
		}

		/**
		 * Expends the healing surge to heal the character for any number of hit dice they currently have
		 * @param {any} sender
		 */
		doHeal(sender) {
			try {
				const heal = this.spendHitDieToHeal();
				this.displayHealAmt(heal, sender);
				this.updateHp(heal);

				//// if hit die remain, ask user if they wish to spend more hit die
				//// if yes, doheal again,
				//// if no, exhaust healing surge
				if (this.isHurt() && this.isHitDiceReady()) {
					this.queryContinue();
				} else {
					this.exhaustHealingSurge(sender);
				}
			} catch (e) {
				if (e instanceof exceptions.HealingSurgeUnusableException ||
					e instanceof exceptions.MissingHitDiceException ||
					e instanceof exceptions.FullHealthException) {
					sendError(e.message, sender);
				} else if (e instanceof exceptions.AttributeDoesNotExistException) {
					sendError(`Missing attribute: ${e.attribute}`, sender);
				} else {
					log("Intelligent Healing Surge threw an unexpected exception");
					log(e);
				}
			} finally {
				return;
			}
		}

		/**
		 * Performs a short rest which recovers up to 1/4th of the max hit die or 1, whichever is greater
		 * @param {any} sender
		 */
		doShortRest(sender) {
			// recover 1/4th of level as hit die, min of 1 hit die, up the max of hit die
			const minimalRecovery = 1;
			const quarter = 4;

			sendFeedback("You feel invigorated after completing a rest", sender);

			// if these two are already equal then we don't need to do anything
			if (this.hitDice === this.maxHitDice) return;

			// Quarter level
			const quarterLevel = Math.floor(this.level / quarter);

			// Determine which one is bigger, the quarter level or the minimal recovery.
			const recovery = Math.max(minimalRecovery, quarterLevel);

			// keeps either the recovery amount plus the current hit dice, or the max hit dice, whichever is the smaller amount.
			this.hitDice = Math.min(recovery + this.hitDice, this.maxHitDice);

			// sets the hit dice to the recovery amount
			this.updateHitDice();

			// renewws the use of the healing surge
			this.renewHealingSurge();
		}

		/**
		 * Performs a long rest which recovers any missing hit dice
		 * @param {any} sender
		 */
		doLongRest(sender) {
			if (this.hitDice !== this.maxHitDice) {
				this.hitDice = this.maxHitDice;
				this.updateHitDice();
			}

			// renewws the use of the healing surge
			this.renewHealingSurge();

			sendFeedback("You feel invigorated after completing a rest", sender);
		}
	}

	/**
	 * Builds macros for ease of use
	 */
	const buildMacros = (function() {
		const create = function(name, command, playerid) {
			createObj("macro",
			{
				name: name,
				action: `!${fields.apiInvoke} -${command}`,
				visibleto: "all",
				istokenaction: true,
				playerid: playerid
			});
		};

		/**
		 * Creates the macros required for running this script
		 * @param {any} playerid the id of the player invoking this command. Required for creating the macros.
		 * @throws RestrictedAccessException if the player invoking this command is not a GM.
		 */
		const run = function(playerid) {
			if (!playerIsGM(playerid)) {
				throw new exceptions.RestrictedAccessException("you must be a GM to use this command.");
			}

			create("IHS_Healing-Surge", fields.commands.surge, playerid);
			create("IHS_Short-Rest", fields.commands.shortRest, playerid);
			create("IHS_Long-Rest", fields.commands.longRest, playerid);
		};
		return {
			run: run
		};
	}());

	/**
	 * Handles the user input passed in
	 * @param {any} userInput
	 */
	const handleInput = function(userInput) {
		var args = userInput.content;
		const selection = userInput.selected;
		const senderid = userInput.playerid;

		// throw away the GM tag because that just messes up whispers
		const sender = userInput.who.replace(" (GM)", "");

		if (userInput.type !== "api") {
			return;
		}

		if (args.indexOf(`!${fields.apiInvoke}`, "") === 0) { // ensure that we are actually being called
			args = args.replace(`!${fields.apiInvoke}`, "").trim();

			try {
				if (args.length !== 0) {
					if (args.indexOf(`-${fields.commands.initialize}`) === 0) {
						buildMacros.run(senderid);
					} else {
						const journal = getJournal.getCharacterJournal(selection);

						const character = new Character(journal);

						if (args.indexOf(`-${fields.commands.surge}`) === 0) {
							character.doHeal(sender);
						} else if (args.indexOf(`-${fields.commands.shortRest}`) === 0) {
							character.doShortRest(sender);
						} else if (args.indexOf(`-${fields.commands.longRest}`) === 0) {
							character.doLongRest(sender);
						} else if (args.indexOf(`-${fields.commands.exhaust}`) === 0) {
							character.exhaustHealingSurge();
						}
					}
				}
			} catch (e) {
				if (e instanceof exceptions.SelectionException ||
					e instanceof exceptions.RestrictedAccessException) {
					const message = `${e.name}: ${e.message}`;
					sendError(message, sender);
				} else {
					log("Intelligent Healing Surge threw an unexpected exception");
					log(e);
				}
			}
		}
	};

	/**
	 * Registers events which launch this script
	 */
	const registerEventHandlers = function() {
		on("chat:message", handleInput);
	};

	/**
	 * Alerts the log that this script is fully loaded
	 */
	const ready = function() {
		log(`${fields.feedbackName} ready.`);
	};

	return {
		ready: ready,
		registerEventHandlers: registerEventHandlers
	};
}());

on("ready",
	function() {
		"use strict";
		IntelligentHealingSurge.registerEventHandlers();
		IntelligentHealingSurge.ready();
	});