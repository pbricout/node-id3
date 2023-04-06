import { buildFramesBuffer } from "./frames-builder"
import { getTags } from "./frames-reader"
import { Options } from "./types/Options"
import { WriteTags } from "./types/Tags"
import { decodeSize, encodeSize } from "./util-size"

const Header = {
    identifier: "ID3",
    size: 10,
    offset: {
        identifier: 0,  // 3 bytes
        version: 3,     // major version: 1 byte
        revision: 4,    // 1 byte
        flags: 5,       // 1 byte
        size: 6         // 4 bytes
    }
} as const

const subarray = (buffer: Buffer, offset: number, size: number) =>
    buffer.subarray(offset, offset + size)

export function createId3Tag(tags: WriteTags) {
    const frames = buildFramesBuffer(tags)
    return embedFramesInId3Tag(frames)
}

export function embedFramesInId3Tag(frames: Buffer) {
    const header = Buffer.alloc(Header.size)
    header.fill(0)
    header.write(Header.identifier, Header.offset.identifier)
    header.writeUInt16BE(0x0300, Header.offset.version)
    header.writeUInt16BE(0x0000, Header.offset.flags)
    encodeSize(frames.length).copy(header, Header.offset.size)

    return Buffer.concat([header, frames])
}

/**
 * Remove already written ID3-Frames from a buffer
 */
export function removeId3Tag(data: Buffer) {
    const tagPosition = findId3TagPosition(data)
    if (tagPosition === -1) {
        return data
    }
    const encodedSize = subarray(data, tagPosition + Header.offset.size, 4)

    if (!isValidEncodedSize(encodedSize)) {
        return false
    }

    if (data.length >= tagPosition + Header.size) {
        const size = decodeSize(encodedSize)
        return Buffer.concat([
            data.subarray(0, tagPosition),
            data.subarray(tagPosition + size + Header.size)
        ])
    }

    return data
}

export function getTagsFromId3Tag(buffer: Buffer, options: Options) {
    const tagBody = getId3TagBody(buffer)
    return getTags(tagBody, options)
}

function getId3TagBody(buffer: Buffer) {
    const tagPosition = findId3TagPosition(buffer)
    if (tagPosition === -1) {
        return undefined
    }
    const encodedSize = subarray(buffer, tagPosition + Header.offset.size, 4)
    const tagSize = Header.size + decodeSize(encodedSize)

    const tagData = subarray(buffer, tagPosition, tagSize)
    const tagHeader = tagData.subarray(0, Header.size)

    // ID3 version e.g. 3 if ID3v2.3.0
    const version = tagHeader[Header.offset.version]
    const tagFlags = parseTagHeaderFlags(tagHeader)
    let extendedHeaderSize = 0
    if (tagFlags.extendedHeader) {
        if (version === 3) {
            extendedHeaderSize = 4 + tagData.readUInt32BE(Header.size)
        } else if(version === 4) {
            extendedHeaderSize = decodeSize(subarray(tagData, Header.size, 4))
        }
    }
    const totalHeaderSize = Header.size + extendedHeaderSize
    const bodySize = tagSize - totalHeaderSize

    // Copy for now, it might not be necessary, but we are not really sure for
    // now, will be re-assessed if we can avoid the copy.
    const body = Buffer.alloc(bodySize)
    tagData.copy(body, 0, totalHeaderSize)

    return {
        version, buffer: body
    }
}

function parseTagHeaderFlags(header: Buffer) {
    if (header.length < Header.size) {
        return {}
    }
    const version = header[3]
    const flagsByte = header[5]
    if (version === 3) {
        return {
            unsynchronisation: !!(flagsByte & 128),
            extendedHeader: !!(flagsByte & 64),
            experimentalIndicator: !!(flagsByte & 32)
        }
    }
    if (version === 4) {
        return {
            unsynchronisation: !!(flagsByte & 128),
            extendedHeader: !!(flagsByte & 64),
            experimentalIndicator: !!(flagsByte & 32),
            footerPresent: !!(flagsByte & 16)
        }
    }
    return {}
}

/**
 * Returns the position of the first valid tag found or -1 if no tag was found.
 */
function findId3TagPosition(buffer: Buffer) {
    // Search Buffer for valid ID3 frame
    let position = -1
    do {
        position = buffer.indexOf(Header.identifier, position + 1)
        if (position !== -1) {
            // It's possible that there is a "ID3" sequence without being an
            // ID3 Frame, so we need to check for validity of the next 10 bytes.
            if (isValidId3Header(buffer.subarray(position))) {
                return position
            }
        }
    } while (position !== -1)
    return -1
}

function isValidId3Header(buffer: Buffer) {
    // From id3.org:
    // An ID3v2 tag can be detected with the following pattern:
    // $49 44 33 yy yy xx zz zz zz zz
    // Where yy is less than $FF, xx is the 'flags' byte and zz is less than
    // $80.
    if (buffer.length < Header.size) {
        return false
    }
    const identifier = buffer.readUIntBE(Header.offset.identifier, 3)
    if (identifier !== 0x494433) {
        return false
    }
    const majorVersion = buffer[Header.offset.version]
    const revision = buffer[Header.offset.revision]
    if (majorVersion === 0xFF || revision === 0xFF) {
        return false
    }
    // This library currently only handle these versions.
    if ([0x02, 0x03, 0x04].indexOf(majorVersion) === -1) {
        return false
    }
    return isValidEncodedSize(subarray(buffer, Header.offset.size, 4))
}

function isValidEncodedSize(encodedSize: Buffer) {
    // The size must not have the bit 7 set
    return ((
        encodedSize[0] |
        encodedSize[1] |
        encodedSize[2] |
        encodedSize[3]
    ) & 128) === 0
}
