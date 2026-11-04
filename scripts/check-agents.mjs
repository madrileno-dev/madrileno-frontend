#!/usr/bin/env node
// Check the files coding agents read: .agents/workspace.md, the skills under
// .agents/skills and the .claude/skills link to them.
// Usage: node scripts/check-agents.mjs [repo-dir]
import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2] ?? '.'
const problems = []

function frontmatter(file) {
  const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/)
  const end = lines.indexOf('---', 1)
  if (lines[0] !== '---' || end === -1) return null
  return Object.fromEntries(
    lines
      .slice(1, end)
      .map((line) => line.match(/^([\w-]+):\s*(.*)$/))
      .filter((match) => match !== null)
      .map(([, key, value]) => [key, value.trim()]),
  )
}

const workspaceFile = path.join(root, '.agents', 'workspace.md')
const workspace = fs.existsSync(workspaceFile) ? frontmatter(workspaceFile) : null
const role = /^[a-z][a-z0-9-]*$/.test(workspace?.role ?? '') ? workspace.role : null
if (workspace === null) problems.push(`${workspaceFile}: missing, or no --- frontmatter`)
else {
  if (role === null) problems.push(`${workspaceFile}: role must be one lower-case word`)
  if (!workspace.summary) problems.push(`${workspaceFile}: no summary`)
}

const skillsDir = path.join(root, '.agents', 'skills')
const skills = fs.existsSync(skillsDir)
  ? fs.readdirSync(skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  : []
if (skills.length === 0) problems.push(`${skillsDir}: no skills`)
for (const { name } of skills) {
  const file = path.join(skillsDir, name, 'SKILL.md')
  const skill = fs.existsSync(file) ? frontmatter(file) : null
  if (skill === null) problems.push(`${file}: missing, or no --- frontmatter`)
  else {
    if (skill.name !== name) problems.push(`${file}: name must be the folder name, ${name}`)
    if (role !== null && !name.startsWith(`${role}-`))
      problems.push(`${file}: the name must start with ${role}-`)
    if (!skill.description) problems.push(`${file}: no description`)
  }
}

const link = path.join(root, '.claude', 'skills')
const target = path.join('..', '.agents', 'skills')
let linked = null
try {
  linked = fs.readlinkSync(link)
} catch {
  linked = null
}
if (linked !== target) problems.push(`${link}: must be a symlink to ${target}`)

if (problems.length > 0) {
  for (const problem of problems) console.error(problem)
  process.exit(1)
}
console.log(`${skills.length} skill(s) and .agents/workspace.md OK`)
