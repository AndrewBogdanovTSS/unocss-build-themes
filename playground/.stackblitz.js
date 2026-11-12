import fs from 'node:fs'

// StackBlitz opens this folder on its own, without the workspace: install the
// published package instead of the local one.
updateWorkspaceDependenciesToLatest('./package.json')

function updateWorkspaceDependenciesToLatest(filename) {
  try {
    const contents = fs.readFileSync(filename, 'utf-8')
    const updatedContent = contents.replace(/"workspace:[^"]*"/g, '"latest"')
    fs.writeFileSync(filename, updatedContent)
  }
  catch (err) {
    console.error(err)
  }
}
