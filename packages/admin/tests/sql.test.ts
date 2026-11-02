import { addUploaderSql, normaliseEmail, sqlString } from '../src/sql.js';

describe('sql helpers', () => {
  it('sqlString doubles quotes', () => {
    expect(sqlString("O'Brien")).toBe("'O''Brien'");
  });
  it('normaliseEmail trims/lowercases and rejects junk', () => {
    expect(normaliseEmail('  Malephex@Gmail.COM ')).toBe('malephex@gmail.com');
    expect(() => normaliseEmail('nope')).toThrow('invalid email');
  });
  it('addUploaderSql escapes name and normalises email', () => {
    const sql = addUploaderSql("O'Brien", 'A@B.c');
    expect(sql).toContain("'O''Brien'");
    expect(sql).toContain("'a@b.c'");
    expect(sql).toContain('last_insert_rowid()');
  });
});
