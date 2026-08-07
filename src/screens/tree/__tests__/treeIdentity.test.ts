import {
  defaultTreeName,
  resolveTreeName,
  sanitizeTreeName,
  TREE_NAME_MAX,
} from '../treeIdentity';

describe('defaultTreeName', () => {
  it('uses the first name when present', () => {
    expect(defaultTreeName({ firstName: 'Sriram' })).toBe("Sriram's Tree");
  });
  it('derives from fullName when firstName is missing', () => {
    expect(defaultTreeName({ fullName: 'Sriram Belur' })).toBe("Sriram's Tree");
  });
  it('falls back to username, then to "My Tree"', () => {
    expect(defaultTreeName({ username: 'amoji' })).toBe("amoji's Tree");
    expect(defaultTreeName({})).toBe('My Tree');
    expect(defaultTreeName(null)).toBe('My Tree');
  });
});

describe('resolveTreeName', () => {
  it('prefers a stored treeName', () => {
    expect(
      resolveTreeName({ firstName: 'Sriram', unsafeMetadata: { treeName: 'Memory Forest' } }),
    ).toBe('Memory Forest');
  });
  it('trims a stored name', () => {
    expect(resolveTreeName({ unsafeMetadata: { treeName: '  Grove  ' } })).toBe('Grove');
  });
  it('falls back to the default when stored name is blank or missing', () => {
    expect(resolveTreeName({ firstName: 'Sriram', unsafeMetadata: { treeName: '   ' } })).toBe("Sriram's Tree");
    expect(resolveTreeName({ firstName: 'Sriram', unsafeMetadata: {} })).toBe("Sriram's Tree");
    expect(resolveTreeName({ firstName: 'Sriram' })).toBe("Sriram's Tree");
  });
  it('ignores non-string stored values', () => {
    expect(resolveTreeName({ firstName: 'Sriram', unsafeMetadata: { treeName: 42 as unknown as string } }))
      .toBe("Sriram's Tree");
  });
});

describe('sanitizeTreeName', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeTreeName('  My   Big  Tree ')).toBe('My Big Tree');
  });
  it('returns null for empty input', () => {
    expect(sanitizeTreeName('   ')).toBeNull();
    expect(sanitizeTreeName('')).toBeNull();
  });
  it('clamps to the max length', () => {
    const long = 'x'.repeat(100);
    expect(sanitizeTreeName(long)).toHaveLength(TREE_NAME_MAX);
  });
});
