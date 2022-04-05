import * as utils from '@apify/storage-local/dist/utils';

describe('utils', () => {
    describe('purgeNullsFromObject', () => {
        test('works with object with nulls', () => {
            const object = {
                one: 1,
                two: [null, 2],
                // @ts-expect-error Object literal's property implicitly has an 'any' type.
                three: null,
                four: {
                    // @ts-expect-error Object literal's property implicitly has an 'any' type.
                    five: null,
                },
                // @ts-expect-error Object literal's property implicitly has an 'any' type.
                six: undefined,
            };
            const purged = utils.purgeNullsFromObject(object);
            expect(purged).toBe(object);
            expect(purged).toStrictEqual({
                one: 1,
                two: [null, 2],
                four: {
                    five: null,
                },
                six: undefined,
            });
        });
        test('works with non-objects', () => {
            expect(utils.purgeNullsFromObject(1)).toBe(1);
            expect(utils.purgeNullsFromObject([1, null])).toStrictEqual([1, null]);
            expect(utils.purgeNullsFromObject(undefined)).toBe(undefined);
            expect(utils.purgeNullsFromObject(null)).toBe(null);
            expect(utils.purgeNullsFromObject('one')).toBe('one');
        });
    });
});
