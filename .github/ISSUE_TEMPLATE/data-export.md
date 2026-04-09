--- 
name: "Demande d'export de donnée'"
about: "Ticket JIRA ou remontée d'un référent numérique"
title: ''
type: 'QA Issue'
labels: 'JIRA/Référent'
assignees: 'jeckel'
---

# Demande d'export des données élèves / exercices :

## Configuration de l'export

- Environnement source :
  - [ ] ovh
  - [ ] mia
  - [ ] us
- Date de début des données : 
- Date de fin des données (optionel) :
- Planification :
  - [ ] One shot  
  - [ ] Récurrent :
	  - Périodicité (ex: tous les jeudi matin) :
	  - Date de fin (optionel, fin de l'expé par exemple) :
- Filtres :
	- [ ] Variations (exemple : `admath/men/main`) :
	- [ ] Module (liste des UUIDs des modules) :
	- [ ] Fragment :
- Colonnes :
	- [ ] Inclure les réponses de l'élève (rend l'export très lourd)
  - [ ] Inclure les calculs de progression

## Demandes supplémentaires

> Ajouter aussi les besoins supplémentaires, précisions, contexte, etc.

## Documentation

- [Dictionnaire des données disponibles](https://github.com/EvidenceB/athena-backend/blob/main/athena-data-pipeline/doc/export_data_dictionary.md)
