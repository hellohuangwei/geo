export interface DiffLine {
  type: 'unchanged' | 'added' | 'removed' | 'modified'
  oldLine?: string
  newLine?: string
}

/** Line-level LCS diff between old and new text */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const m = oldLines.length
  const n = newLines.length

  // LCS
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])

  // Backtrack
  const raw: Array<{ type: 'unchanged' | 'added' | 'removed'; oldLine?: string; newLine?: string }> = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      raw.push({ type: 'unchanged', oldLine: oldLines[i - 1], newLine: newLines[j - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ type: 'added', newLine: newLines[j - 1] })
      j--
    } else {
      raw.push({ type: 'removed', oldLine: oldLines[i - 1] })
      i--
    }
  }
  raw.reverse()

  // Merge adjacent removed+added → modified
  const result: DiffLine[] = []
  for (let k = 0; k < raw.length; k++) {
    const cur = raw[k]
    if (cur.type === 'removed' && k + 1 < raw.length && raw[k + 1].type === 'added') {
      result.push({ type: 'modified', oldLine: cur.oldLine, newLine: raw[k + 1].newLine })
      k++
    } else if (cur.type === 'unchanged') {
      result.push({ type: 'unchanged', oldLine: cur.oldLine, newLine: cur.newLine })
    } else if (cur.type === 'added') {
      result.push({ type: 'added', newLine: cur.newLine })
    } else {
      result.push({ type: 'removed', oldLine: cur.oldLine })
    }
  }
  return result
}
