const debug = require('debug')('millegrilles:maitrecomptes:route');
const express = require('express')
const bodyParser = require('body-parser')

const {
  initialiser: initAuthentification,
  challengeRegistrationU2f,
  verifierChallengeRegistrationU2f,
  keylen,
  hashFunction} = require('./authentification')

var _hostname = null,
    _idmg = null,
    _proprietairePresent = false

function routeApi() {
  const route = express.Router()
  route.use(bodyParser.json())
  route.get('/applications.json', listeApplications)

  return route
}

async function infoMillegrille(req, res, next) {
  // Verifie si la MilleGrille est initialisee. Conserve le IDMG

  if( ! _proprietairePresent ) {
    // Faire une requete pour recuperer l'information
    const domaineAction = 'MaitreDesComptes.infoProprietaire'
    const requete = {}
    debug("Requete info proprietaire")
    const compteProprietaire = await req.amqpdao.transmettreRequete(
      domaineAction, requete, {decoder: true})

    debug("Reponse compte proprietaire")
    debug(compteProprietaire)

    if(compteProprietaire.webauthn) {
      // Conserver dans une variable globale, evite une requete sur le compte
      // du proprietaire a chaque fois pour verifier
      _proprietairePresent = true
    } else {
      _proprietairePresent = false
    }
  }

  const reponse = { idmg: _idmg, proprietairePresent: _proprietairePresent }

  res.send(reponse)
}

async function listeApplications(req, res, next) {
  const nomUsager = req.nomUsager
  const sessionUsager = req.session

  var niveauSecurite = sessionUsager.niveauSecurite || '1.public'
  debug("Demande liste applications niveau %s", niveauSecurite)

  const topologieDao = req.topologieDao
  const applications = await topologieDao.getListeApplications(niveauSecurite)
  debug("Liste applications recues: \n%O", applications)

  var liste = applications.map(app=>{
    return {
      url: app.url,
      nom: app.application,
      nomFormatte: app.application,
      securite: app.securite,
    }
  })

  res.send(liste)
}

function initialiser(hostname, amqpdao, extraireUsager, opts) {
  if(!opts) opts = {}
  _hostname = hostname
  _idmg = amqpdao.pki.idmg
  debug("IDMG: %s, AMQPDAO : %s", _idmg, amqpdao !== undefined)

  const route = express.Router()

  route.use('/api', routeApi())
  route.use('/authentification', initAuthentification({extraireUsager}, hostname, _idmg))
  route.get('/info.json', infoMillegrille)

  // Exposer le certificat de la MilleGrille (CA)
  route.use('/millegrille.pem', express.static(process.env.MG_MQ_CAFILE))

  ajouterStaticRoute(route)

  debug("Route /millegrilles de maitre des comptes est initialisee")
  return route
}

function ajouterStaticRoute(route) {
  // Route utilisee pour transmettre fichiers react de la messagerie en production
  var folderStatic =
    process.env.MG_STATIC_RES ||
    'static/millegrilles'

  route.get('*', cacheRes, express.static(folderStatic))
  debug("Route %s pour millegrilles initialisee", folderStatic)
}

function routeInfo(req, res, next) {
  debug(req.headers)
  const idmg = req.amqpdao.pki.idmg
  const nomUsager = req.headers['user-name']
  const userId = req.headers['user-id']
  const niveauSecurite = req.headers['user-securite']
  const host = req.headers.host

  const reponse = {idmg, nomUsager, userId, hostname: host, niveauSecurite}
  return res.send(reponse)
}

function cacheRes(req, res, next) {

  const url = req.url
  debug("Cache res URL : %s", url)
  if(url.endsWith('.chunk.js') || url.endsWith('.chunk.css')) {

       // Pour les .chunk.js, on peut faire un cache indefini (immutable)
    res.append('Cache-Control', 'max-age=86400')
    res.append('Cache-Control', 'immutable')

  } else {
    // Pour les autrres, faire un cachee limite (e.g. .worker.js, nom ne change pas)
    res.append('Cache-Control', 'max-age=60')
  }

  // res.append('Cache-Control', 'max-age=86400')
  res.append('Cache-Control', 'public')

  next()
}

module.exports = {initialiser}
