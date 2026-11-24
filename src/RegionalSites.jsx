import React from 'react';
import {regionalSites, regionalUrl} from '../shared/regional-sites.js';
import './regional-sites.css';

export default function RegionalSites({L}) {
  return <nav className="regional-sites" aria-label={L('Regionale Websites','Regionalna spletna mesta')}>
    <span>{L('Regionale Websites','Regionalna spletna mesta')}</span>
    {Object.entries(regionalSites).map(([country,site])=><a key={country} href={regionalUrl(country,location.pathname)} hrefLang={site.language}>{site.label}<small>equitensa.{country.toLowerCase()}</small></a>)}
  </nav>;
}
