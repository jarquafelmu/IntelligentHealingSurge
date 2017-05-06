/**
 * Goals of Project
 *
 * Healing surges can be used once per short rest.
 *
 * A single healing surge lets a user roll any number of hit die to recover.
 * Each hit die gets added to their consitution mod in order to
 * determine the full hp recovered for that single die.
 *
 * When the user chooses to use a healing surge, roll one hit die + con and add it
 * to the hp. This will inform the user of the result. Then, if the user is still
 * below max hp, the user will be asked if they would like to roll another hit die, if any are
 * available.
 *
 * If the user says yes then another die is rolled. If the user says no then the healing surge ability
 * will be exhausted until they finish a short rest.
 *
 * If the user tries to use a healing surge while it is exhausted inform the user that they cannot because it is
 * not avaiable.
 *
 * If the user tries to use a healing surge while they have no hit dice, (really shouldn't be the case), inform them that
 * they are all out of hit die to spend.
 *
 * During each short the use of healing surge is renewed.
 * Additionally, the user recovers a number of hit die equal to 1/4th the
 * user's current level, with a minimal recovery of 1 hit die.
 *
 * During a long rest all hit die are recovered.
*/

var IntelligentHealingSurge = IntelligentHealingSurge || (function () {
	"use strict";

	// ReSharper disable once UnusedLocals
	/**
	 * Script information
	 */
	const info = Object.freeze({
		version: "0.0.1",
		created: "5/6/2017",
		lastupdate: "5/6/2017",
		author: "Sam T."
	});

	/**
	 * Useful constants for defining certain parts of the code
	 */
	const fields = Object.freeze({
		feedbackName: "Ability Check Group",
		apiInvoke: "acg"
	});

	const commonAttributeNames = Object.freeze({
		healingSurge: "",
		hitDie: "",
		hp: "",
		hpmax: "",

	});

	/**
	 * Send feedback
	 * 
	 * @param {string} msg	The message to send
	 * @param {string} name The a person who should be whispered instead, defaults to gm if
	 *                      left blank but if supplied null it will output to everyone [optional]
	 */
	var sendFeedback = function (msg, name) {
		if (name === undefined) {
			name = "gm";
		}

		let content = `${msg}`;
		content = name !== null ? `/w "${name}" ${content}` : content;

		sendChat(fields.feedbackName, content);
	};

	/**
	 * Alert the GM that there has been an error
	 * 
	 * @param {string} msg The error message to send
	 */
	var sendError = function (msg, name) {
		msg = `<span style="color: red; font-weight: bold;">${msg}</span>`;

		if (name === undefined) {
			name = "gm";
			sendFeedback(msg, name);
		} else {
			sendFeedback(msg);
		}
	};

	// Use Math.min(x, y) to compute the minimum of supplied values

	// Use Math.max(x, y) to compute the maximum of supplied values

	/**
	 * Contains methods for telling special exceptions
	 */
	const exceptions = (function () {
		/**
		 * Exception is used when the api invoker has failed to select a valid token
		 * @param {any} message
		 */
		const selectionException = function (message) {
			this.message = message;
			this.name = "SelectionException";
		}

		/**
		 * Exception is used when an attribute doesn't exist for a character.
		 *
		 * Example, if the api invoker requests something other than str|dex|con|int|wis|cha
		 * 
		 * @param {any} message
		 */
		const attributeDoesNotExistException = function (message) {
			this.message = message;
			this.name = "AttributeDoesNotExistException";
		}

		return {
			/**
			 * Exception is used when an attribute doesn't exist for a character.
			 *
			 * Example, if the api invoker requests something other than str|dex|con|int|wis|cha
			 * 
			 * @param {any} message
			 */
			AttributeDoesNotExistException: attributeDoesNotExistException,

			/**
			 * Exception is used when the api invoker has failed to select a valid token
			 * @param {any} message
			 */
			SelectionException: selectionException
		}
	}());

	/**
	 * Contains methods which interact directly with the token or journal.
	 */
	const characterHandler = (function () {
		/**
		 * Checks if a valid token exists in selection, returns first match.
		 * 
		 * @param {any} selection the selected object
		 *
		 * @return an object representing a token, otherwise null.
		 */
		var getTokenObj = function (selection) {
			var graphic;
			if (!selection ||
				selection.length !== 1 ||
				// ReSharper disable once UsageOfPossiblyUnassignedValue
				// ReSharper disable once QualifiedExpressionIsNull
				// ReSharper disable once PossiblyUnassignedProperty
				!(graphic = getObj("graphic", selection[0]._id) || graphic.get("_subtype") !== "token") ||
				graphic.get("isdrawing")) {
				throw new exceptions.selectionException("A token must be selected before using this script.");
			}

			return getObj("graphic", selection[0]._id);
		};

		/**
		 * check if the character object exists, return first match
		 *
		 * @param {string} name	attribute name
		 * @param {string} type the type of the attribute
		 * @param {string} id the character id
		 *
		 * @return returns first match, otherwise null
		 */
		var characterObjExists = function (name, type, charId) {
			var retval = null;
			const obj = findObjs({
				_type: type,
				name: name,
				_characterid: charId
			});
			if (obj.length > 0) {
				retval = obj[0];
			}
			return retval;
		};

		/**
		 * Retrieves the value for the attribute
		 * 
		 * @param {any} attribute the attribute
		 *
		 * @return the attribute value, otherwise null.
		 */
		const getAttributeValue = function (attribute) {
			if (attribute) {
				return attribute.get("current");
			} else {
				return null;
			}
		}

		/**
		 * Gets the character journal object for which the token represents.
		 * 
		 * @param {any} selection The currently selected token
		 * @return the character journal if any is found, otherwise null.
		 */
		const getCharacterJournal = function (selection) {
			const curToken = getTokenObj(selection);
			if (!curToken) {
				return null;
			}

			const journal = getObj("character", curToken.get("represents"));
			if (journal) {
				const id = journal.get("_id");
				const name = getAttributeValue(characterObjExists("name", "attribute", id)) || journal.get("name");
				const isNpc = getAttributeValue(characterObjExists("npc", "attribute", id)) === "1";

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
		const useNpcAttributeName = function (id, attribute) {
			const result = parseInt(getAttributeValue(characterObjExists(`${attribute}_flag`, "attribute", id)));
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

	const computeHealAmt = function(hitDieMax, conMod) {
		
	}

	const doHeal = function (character)
	{
		
	}

	const isHealingSurgeReady = function() {
		
	}

	const isHitDiceReady = function () {

	}

	const recoverHitDie = function() {
		
	}

	const doShortRest = function() {
		
	}

	const doLongRest = function() {
		
	}

	const handleInput = function(userInput) {
		var args = userInput.content;
		const selection = userInput.selected;

		// throw away the GM tag because that just messes up whispers
		const sender = userInput.who.replace(" (GM)", "");

		if (userInput.type !== "api") {
			return;
		}

		if (args.indexOf(`!${fields.apiInvoke}`, "") === 0) { // ensure that we are actually being called
			args = args.replace(`!${fields.apiInvoke}`, "").trim();

			try {
				const character = token.getCharacterJournal(selection);

				if (args.length !== 0) {
					if (args.indexOf("-surge") === 0) {
					} else if (args.indexOf("-shortRest") === 0) {
					} else if (args.indexOf("-longRest") === 0) {
					}
				}
			} catch (e) {
				if (e instanceof exceptions.SelectionException) {
					const message = `${e.name}: ${e.message}`;
					sendError(message, sender);
				} else {
					sendError(e);
				}
			}
		}
	};

	/**
	 * Registers events which launch this script
	 */
	const registerEventHandlers = function () {
		on("chat:message", handleInput);
	};

	/**
	 * Alerts the log that this script is fully loaded
	 */
	const ready = function () {
		log(`${fields.feedbackName} ready.`);
	};

	return {
		ready: ready,
		registerEventHandlers: registerEventHandlers
	};
}());

on("ready", function () {
	"use strict";
	IntelligentHealingSurge.registerEventHandlers();
	IntelligentHealingSurge.ready();
});