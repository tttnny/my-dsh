#!/usr/bin/env node

const { runLiveGateCli } = await import('../lib/live-gates.js')
process.exitCode = await runLiveGateCli(process.argv.slice(2), process.env)
