import Workspace from './workspace';
import {CodexProvider} from './codex-provider';
import {AccountProvider} from './account-provider';
export default function Home(){return <AccountProvider><CodexProvider><Workspace/></CodexProvider></AccountProvider>}
