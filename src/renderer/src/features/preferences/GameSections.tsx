// GameSections — the three Preferences sections about the game and its log: the EverQuest
// install folder, Summarize and archive log, and Send my loot to the wiki.
//
// They were three items inside one "Game" section; the owner asked for the last two to be their
// own sections (2026-11-26: "these should really be their own two sections, not inside Game").
// The first keeps the id `game`, so a deep link or a test that opens it lands where it did.

import type { PrefSection } from './PreferencesView'
import SportsEsportsIcon from '@mui/icons-material/SportsEsports'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import { EqFolderSetting } from './EqFolderSetting'
import { LogArchiveSetting } from './LogArchiveSetting'
import { DropObsSetting } from './DropObsSetting'

export function gameSection(): PrefSection {
  return {
    id: 'game',
    label: 'EverQuest folder',
    icon: <SportsEsportsIcon fontSize="small" />,
    items: [
      {
        id: 'eq-folder',
        label: 'EverQuest install folder',
        keywords: 'game path directory logs eqlog character detect override install location',
        content: <EqFolderSetting />
      }
    ]
  }
}

// SUMMARIZE AND ARCHIVE LOG (docs/plans/log-archive). Off until the player turns it on (step 6.3).
export function logArchiveSection(): PrefSection {
  return {
    id: 'log-archive',
    label: 'Log archive',
    icon: <Inventory2Icon fontSize="small" />,
    items: [
      {
        id: 'log-archive',
        label: 'Summarize and archive log',
        keywords: 'log archive rotate clear compress backup history size shrink large slow loading',
        content: <LogArchiveSetting />
      }
    ]
  }
}

// SEND MY LOOT TO THE WIKI: the drop database (requirements/drop-db-submit.md). Off until the
// player turns it on.
export function dropObsSection(): PrefSection {
  return {
    id: 'drop-obs',
    label: 'Loot to the wiki',
    icon: <CloudUploadIcon fontSize="small" />,
    items: [
      {
        id: 'drop-obs',
        label: 'Send my loot to the wiki',
        keywords:
          'wiki drop database drop list loot reports percent rate chance submit upload share eqlwiki bot password sign in observations',
        content: <DropObsSetting />
      }
    ]
  }
}
