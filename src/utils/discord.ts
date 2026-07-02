/**
 * Découpe un texte en morceaux respectant la limite de longueur d'un message
 * Discord (2000 caractères). Le découpage privilégie les frontières de lignes
 * afin de ne pas couper au milieu d'un mot ; une ligne trop longue est
 * découpée en dur.
 */
export function splitForDiscord(text: string, maxLength = 1900): string[] {
  if (text.length <= maxLength) {
    return text.length > 0 ? [text] : [];
  }

  const chunks: string[] = [];
  let current = '';

  for (const line of text.split('\n')) {
    // Ligne unique plus longue que la limite : on la découpe en dur.
    if (line.length > maxLength) {
      if (current.length > 0) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < line.length; i += maxLength) {
        chunks.push(line.slice(i, i + maxLength));
      }
      continue;
    }

    const candidate = current.length > 0 ? `${current}\n${line}` : line;
    if (candidate.length > maxLength) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}
