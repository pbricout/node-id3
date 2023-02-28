import * as NodeID3 from '../index'
import assert = require('assert')
import chai = require('chai')
import * as fs from 'fs'

describe('NodeID3', function () {
    describe('#write()', function() {
        const nonExistingFilepath = './hopefully-does-not-exist.mp3'
        it('sync not existing filepath', function() {
            chai.assert.isFalse(fs.existsSync(nonExistingFilepath))
            chai.assert.instanceOf(
                NodeID3.write({}, nonExistingFilepath), Error
            )
        })
        it('async not existing filepath', function() {
            chai.assert.isFalse(fs.existsSync(nonExistingFilepath))
            NodeID3.write({}, nonExistingFilepath, function(err) {
                if(!(err instanceof Error)) {
                    assert.fail("No error thrown on non-existing filepath")
                }
            })
        })

        const buffer = Buffer.from([0x02, 0x06, 0x12, 0x22])
        const titleTag = {
            title: "abc"
        } satisfies NodeID3.WriteTags
        const filepath = './testfile.mp3'

        it('sync write file without id3 tag', function() {
            fs.writeFileSync(filepath, buffer, 'binary')
            NodeID3.write(titleTag, filepath)
            const newFileBuffer = fs.readFileSync(filepath)
            fs.unlinkSync(filepath)
            assert.strictEqual(Buffer.compare(
                newFileBuffer,
                Buffer.concat([NodeID3.create(titleTag), buffer])
            ), 0)
        })

        it('async write file without id3 tag', function(done) {
            fs.writeFileSync(filepath, buffer, 'binary')
            NodeID3.write(titleTag, filepath, function() {
                const newFileBuffer = fs.readFileSync(filepath)
                fs.unlinkSync(filepath)
                if(Buffer.compare(
                    newFileBuffer,
                    Buffer.concat([NodeID3.create(titleTag), buffer])
                ) === 0) {
                    done()
                } else {
                    done(new Error("buffer not the same"))
                }
            })
        })

        {

        const bufferWithTag = Buffer.concat([NodeID3.create(titleTag), buffer])
        const albumTag = {
            album: "ix123"
        } satisfies NodeID3.WriteTags

        it('sync write file with id3 tag', function() {
            fs.writeFileSync(filepath, bufferWithTag, 'binary')
            NodeID3.write(albumTag, filepath)
            const newFileBuffer = fs.readFileSync(filepath)
            fs.unlinkSync(filepath)
            assert.strictEqual(Buffer.compare(
                newFileBuffer,
                Buffer.concat([NodeID3.create(albumTag), buffer])
            ), 0)
        })
        it('async write file with id3 tag', function(done) {
            fs.writeFileSync(filepath, bufferWithTag, 'binary')
            NodeID3.write(albumTag, filepath, function() {
                const newFileBuffer = fs.readFileSync(filepath)
                fs.unlinkSync(filepath)
                if(Buffer.compare(
                    newFileBuffer,
                    Buffer.concat([NodeID3.create(albumTag), buffer])
                ) === 0) {
                    done()
                } else {
                    done(new Error("file written incorrectly"))
                }
            })
        })
    }
    })

    describe('#read()', function() {
        it('read empty id3 tag', function() {
            const frame = NodeID3.create({})
            assert.deepStrictEqual(
                NodeID3.read(frame),
                {raw: {}}
            )
        })

        it('read text frames id3 tag', function() {
            const frame = NodeID3.create({ title: "asdfghjÄÖP", album: "naBGZwssg" })
            assert.deepStrictEqual(
                NodeID3.read(frame),
                { title: "asdfghjÄÖP", album: "naBGZwssg", raw: { TIT2: "asdfghjÄÖP", TALB: "naBGZwssg" }}
            )
        })

        it('read tag with broken frame', function() {
            const frame = NodeID3.create({ title: "asdfghjÄÖP", album: "naBGZwssg" })
            frame[10] = 0x99
            assert.deepStrictEqual(
                NodeID3.read(frame),
                { album: "naBGZwssg", raw: { TALB: "naBGZwssg" }}
            )
        })

        it('read tag with bigger size', function() {
            const frame = NodeID3.create({ title: "asdfghjÄÖP", album: "naBGZwssg" })
            const newFrameSize = 127
            frame[9] = 127
            assert.ok(frame.length < newFrameSize + 10)
            assert.deepStrictEqual(
                NodeID3.read(frame),
                { title: "asdfghjÄÖP", album: "naBGZwssg", raw: { TIT2: "asdfghjÄÖP", TALB: "naBGZwssg" }}
            )
        })

        it('read tag with smaller size', function() {
            const frame = NodeID3.create({ title: "asdfghjÄÖP", album: "naBGZwssg" })
            frame[9] -= 25
            assert.deepStrictEqual(
                NodeID3.read(frame),
                { title: "asdfghjÄÖP", raw: { TIT2: "asdfghjÄÖP" }}
            )
        })

       it('read tag with invalid size', function() {
            const frame = NodeID3.create({ title: 'a' })
            frame[9] = 128
            assert.deepStrictEqual(
                NodeID3.read(frame).raw,
                {}
            )
        })

        it('read TXXX frame', function() {
            const tags = { userDefinedText: {description: "abc", value: "deg"} }
            const frame = NodeID3.create(tags)
            assert.deepStrictEqual(
                NodeID3.read(frame),
                {
                    userDefinedText: [tags.userDefinedText],
                    raw: {
                        TXXX: [tags.userDefinedText]
                    }
                }
            )
        })

        it('read TXXX array frame', function() {
            const tags = { userDefinedText: [{description: "abc", value: "deg"}, {description: "abcd", value: "efgh"}] }
            const frame = NodeID3.create(tags)
            assert.deepStrictEqual(
                NodeID3.read(frame),
                {
                    userDefinedText: tags.userDefinedText,
                    raw: {
                        TXXX: tags.userDefinedText
                    }
                }
            )
        })

        it('create mixed v3/v4 tag', function() {
            const frameBuf = Buffer.from('494433030000000000315449543200000009000001fffe61006c006c005459455200000005000001fffe33005444524300000005000001fffe3400', 'hex')

            const tags = {
                title: "all",
                year: "3",
                recordingTime: "4"
            }

            assert.deepStrictEqual(
                NodeID3.read(frameBuf, { noRaw: true }),
                tags
            )
        })

        it('read exclude', function() {
            const tagsWithoutTitle = {
                album: "nasÖÄkdnasd",
                year: "1990"
            } satisfies NodeID3.WriteTags
            const tags = {
                TIT2: "abcdeÜ看板かんばん",
                ...tagsWithoutTitle
            } satisfies NodeID3.WriteTags

            const buffer = NodeID3.create(tags)
            const read = NodeID3.read(buffer, { exclude: ['TIT2'], noRaw: true })
            assert.deepStrictEqual(
                read,
                tagsWithoutTitle
            )
        })

        it('read include', function() {
            const tagsWithoutYear = {
                title: "abcdeÜ看板かんばん",
                album: "nasÖÄkdnasd"
            } satisfies NodeID3.WriteTags
            const tags = {
                ...tagsWithoutYear,
                year: "1990"
            } satisfies NodeID3.WriteTags

            const buffer = NodeID3.create(tags)
            const read = NodeID3.read(buffer, { include: ['TALB', 'TIT2'], noRaw: true })
            assert.deepStrictEqual(
                read,
                tagsWithoutYear
            )
        })

        it('onlyRaw', function() {
            const tags = {
                TIT2: "abcdeÜ看板かんばん",
                TALB: "nasÖÄkdnasd"
            } satisfies NodeID3.WriteTags

            const buffer = NodeID3.create(tags)
            const read = NodeID3.read(buffer, { onlyRaw: true })
            assert.deepStrictEqual(
                read,
                tags
            )
        })

        it('noRaw', function() {
            const tags = {
                title: "abcdeÜ看板かんばん",
                album: "nasÖÄkdnasd"
            } satisfies NodeID3.WriteTags

            const buffer = NodeID3.create(tags)
            const read = NodeID3.read(buffer, { noRaw: true })
            assert.deepStrictEqual(
                read,
                tags
            )
        })

        it('compressed frame', function() {
            const frameBufV3 = Buffer.from('4944330300000000001c5449543200000011008000000005789c6328492d2e0100045e01c1', 'hex')
            const frameBufV4 = Buffer.from('4944330400000000001c5449543200000011000900000005789c6328492d2e0100045e01c1', 'hex')
            const tags = { TIT2: 'test' }

            assert.deepStrictEqual(
                NodeID3.read(frameBufV3).raw,
                tags
            )

            assert.deepStrictEqual(
                NodeID3.read(frameBufV4).raw,
                tags
            )
        })
    })
})
