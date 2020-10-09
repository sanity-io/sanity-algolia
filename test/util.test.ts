import { flattenBlocks } from '../src/util'
import fixture from './fixtures/internalFaq.json'

describe('flattenBlocks', () => {
  it('extracts the texts', () => {
    const result = flattenBlocks(fixture.body)
    expect(result).toEqual('This is a paragraph')
  });

  it('removes english stopwords via parameter', () => {
    const result = flattenBlocks(fixture.body, true)
    expect(result).toEqual('paragraph')
  })
});
