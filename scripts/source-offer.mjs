export function sourceOffer(repository, commit, dirty) {
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repository))
    throw new Error(
      'Set repository.url to the public GitHub repository containing this deployment source.',
    );
  const revision = !dirty && /^[a-f0-9]{40}$/.test(commit || '') ? commit : null;
  return {
    name: 'Little Days',
    license: 'AGPL-3.0-only with Little Days Remotion linking exception',
    copyright: 'Copyright (c) 2026 thaihoandev and contributors',
    repository,
    revision,
    development: !revision,
    sourceUrl: revision ? repository + '/tree/' + revision : repository,
    archiveUrl: revision ? repository + '/archive/' + revision + '.tar.gz' : null,
  };
}
