// main/logArchive/liveTooLarge.ts - the app's one `TooLargeMemory`, bound to its settings.

import { app } from 'electron'
import { noteLogReadTouched } from '../dataServer/logReadState'
import { getLogArchivePrefs, setLogArchivePrefs } from '../storeLogArchive'
import { refusalFor } from '../../shared/logArchive/tooLarge'
import { createTooLargeMemory, readLogIdentity } from './tooLargeLog'

export const liveTooLarge = createTooLargeMemory({
  version: () => app.getVersion(),
  refusal: (character) => refusalFor(getLogArchivePrefs(), character),
  save: (character, refusal) => {
    const refusedTooLarge = { ...getLogArchivePrefs().refusedTooLarge, [character]: refusal }
    setLogArchivePrefs({ refusedTooLarge })
  },
  readLog: readLogIdentity,
  changed: noteLogReadTouched
})
