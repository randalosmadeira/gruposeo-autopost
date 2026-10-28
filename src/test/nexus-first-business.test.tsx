import {afterEach,describe,it,expect,vi} from 'vitest';
import {render,screen,cleanup,waitFor} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {NexusFirstBusiness} from '@/components/NexusFirstBusiness';
const fixture=vi.hoisted(()=>({projects:[] as Array<{id:string}>,isLoading:false,error:null as Error|null}));
vi.mock('@/hooks/useProjects',()=>({useProjects:()=>fixture}));
function Location(){const location=useLocation();return <output data-testid="location">{location.pathname}</output>;}
function mount(){render(<MemoryRouter initialEntries={['/dashboard']}><NexusFirstBusiness/><Location/></MemoryRouter>);}
afterEach(()=>{cleanup();fixture.projects=[];fixture.isLoading=false;fixture.error=null;});
describe('first business onboarding',()=>{
 it('opens the questionnaire for a loaded account without projects',async()=>{mount();await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/business-profile'));});
 it('preserves the dashboard for existing projects',()=>{fixture.projects=[{id:'existing'}];mount();expect(screen.getByTestId('location').textContent).toBe('/dashboard');});
 it('does not mistake a loading or failed lookup for an empty account',()=>{fixture.error=new Error('offline');mount();expect(screen.getByTestId('location').textContent).toBe('/dashboard');});
});
