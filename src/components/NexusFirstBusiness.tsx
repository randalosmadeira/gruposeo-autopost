import {useEffect} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {useProjects} from '@/hooks/useProjects';
export function NexusFirstBusiness(){
 const {projects,isLoading,error}=useProjects();const location=useLocation();const navigate=useNavigate();
 useEffect(()=>{if(!isLoading&&!error&&projects.length===0&&['/','/dashboard'].includes(location.pathname))navigate('/business-profile',{replace:true});},[isLoading,error,projects.length,location.pathname,navigate]);
 return null;
}
