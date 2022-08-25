/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-present eyeo GmbH
 *
 * Adblock Plus is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * Adblock Plus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Adblock Plus.  If not, see <http://www.gnu.org/licenses/>.
 */

"use strict";

let yargs = require("yargs");
let {hideBin} = require("yargs/helpers");

let {createConverter, processFile} = require("../lib/dnr/index.js");

function parseArgs(cliArgv) {
  const args = yargs(hideBin(cliArgv))
        .scriptName("text2dnr")
        .usage("Usage: $0 [-o output] <inputfile>")
        .option("o", {
          alias: "output",
          describe: "Output file",
          type: "string",
          requiresArg: true
        })
        .check((argv, options) => {
          if (argv._.length != 1)
            throw new Error("Exactly one filename is needed.\n");
          else if (argv.output == "")
            throw new Error("Output filename must be specified.\n");
          else
            return true;
        })
        .exitProcess(false)
        .help();

  let outputfile = args.argv.output;
  let filename = args.argv._[0];

  return {filename, outputfile};
}

async function main() {
  let {filename, outputfile} = parseArgs(process.argv);
  await processFile(createConverter({}), filename, outputfile);
}


if (require.main == module) {
  main().catch(err => {
    console.error(err);
    process.exit(255);
  });
}


exports.parseArgs = parseArgs;
exports.processFile = processFile;
