import { Tags, RawTags, WriteTags  } from "./types/Tags"
import { FrameOptions } from "./definitions/FrameOptions"
import { convertWriteTagsToRawTags } from "./TagsConverters"
import * as ID3Util from "./ID3Util"


export function updateTags(newTags: WriteTags, currentTags: Tags): RawTags {
    const newRawTags = convertWriteTagsToRawTags(newTags)

    const currentRawTags = currentTags.raw ?? {}
    Object.keys(newRawTags).map(frameIdentifierString => {
        const frameIdentifier = frameIdentifierString as keyof RawTags
        const newFrame = newRawTags[frameIdentifier]
        const updatedFrame = updateFrameIfMultiple(
            ID3Util.getSpecOptions(frameIdentifier),
            newFrame,
            currentRawTags[frameIdentifier]
        )
        // eslint-disable-next-line
        currentRawTags[frameIdentifier] = (updatedFrame || newFrame) as any
    })
    return currentRawTags
}

function updateFrameIfMultiple(
    options: FrameOptions,
    newTag: RawTags[keyof RawTags],
    currentTag: RawTags[keyof RawTags],
) {
    if (
        !options.multiple ||
        !newTag ||
        !currentTag ||
        !Array.isArray(currentTag)
    ) {
        return null
    }

    const newTagArray = newTag instanceof Array ? newTag : [newTag]
    const compareKey = options.updateCompareKey
    if (!compareKey) {
        return [...currentTag, ...newTagArray]
    }

    const compareValueToFrameIndex: Record<string, number> = {}
    currentTag.forEach((tag, index) => {
        if (typeof tag === "object") {
              const compareValue = tag[compareKey as keyof typeof tag]
            compareValueToFrameIndex[compareValue] = index
        }
    })

    newTagArray.forEach((tagValue) => {
        // eslint-disable-next-line
        const assignableTagValue = tagValue as any
        if (
            typeof tagValue === "object" &&
            tagValue[compareKey as keyof typeof tagValue] in compareValueToFrameIndex
        ) {
            const tagProperty = tagValue[compareKey as keyof typeof tagValue]
            const frameIndex = compareValueToFrameIndex[tagProperty]
            currentTag[frameIndex] = assignableTagValue
        } else {
            currentTag.push(assignableTagValue)
        }
    })
    return currentTag
}
