import React, {useState, useEffect, useCallback, Suspense} from 'react'
import {Container, Alert} from 'react-bootstrap'
import {proxy as comlinkProxy} from 'comlink'
import Authentifier, {AlertReauthentifier, entretienCertificat} from './Authentifier'
import Layout from './Layout'

import '../components/i18n'
import './App.css'

const AccueilUsager = React.lazy(_=>import('./AccueilUsager'))

// Methodes et instances gerees hors des lifecycle react
var _connexionWorker,
    _chiffrageWorker
    // _connexionInstance,
    // _chiffrageInstance

// window.onbeforeunload = cleanupApp

export default function App(props) {

  const [err, setErr] = useState('')
  const [workers, setWorkers] = useState('')
  const [dateChargementCle, setDateChargementCle] = useState('')  // Date de reload cle/certificat
  const [infoIdmg, setInfoIdmg] = useState('')
  const [connecte, setConnecte] = useState(false)
  const [etatProtege, setEtatProtege] = useState(false)
  const [nomUsager, setNomUsager] = useState('')
  const [infoUsager, setInfoUsager] = useState('')
  const [errConnexion, setErrConnexion] = useState(false)

  useEffect( _ => {
    // Init workers, background
    initialiserWorkers(setWorkers)
  }, [])

  const changerInfoUsager = useCallback( infoUsager => {
    console.debug("Nouveau info usager : %O", infoUsager)
    setInfoUsager(infoUsager)
    const nomUsager = infoUsager.nomUsager || ''

    setNomUsager(nomUsager)

    if(nomUsager) {
      _connexionWorker.socketOff('connect')
      _connexionWorker.socketOn('connect', comlinkProxy(_ =>{
        // Utilise pour les reconnexions seulement (connect initial est manque)
        reconnecter(nomUsager, setConnecte, setInfoUsager, setErrConnexion)
      }))

      const workers = {
        chiffrage: _chiffrageWorker,
        connexion: _connexionWorker,
      }

      // S'assurer que le certificat local existe, renouveller au besoin
      entretienCertificat(workers, nomUsager, infoUsager)
        .then(async _=>{
          const sessionOk = await verifierSession()
          console.debug("Session ok? : %O", sessionOk)
          initialiserClesWorkers(nomUsager, workers, setDateChargementCle)
        })
        .catch(err=>{console.error("Erreur initialisation certificat ou cle workers %O", err)})
    }
  }, [])

  const changerErrConnexion = useCallback( errConnexion => {
    console.warn("Erreur de connexion? %s", errConnexion)
    setErrConnexion(errConnexion)
  }, [])

  // Hook changement usager
  useEffect( _ => {
    init(setWorkers, setInfoIdmg, setConnecte, setEtatProtege, changerInfoUsager, setDateChargementCle, changerErrConnexion)
  }, [changerInfoUsager, changerErrConnexion] )

  const _initialiserClesWorkers = useCallback(async _nomUsager=>{
    console.debug("_initialiserClesWorkers : %O, %O", _nomUsager, workers)
    initialiserClesWorkers(_nomUsager, workers, setDateChargementCle)
      .catch(err=>{
        console.warn("Erreur initialiser cles workers : %O", err)
      })
  }, [workers])

  const deconnecter = useCallback(async _=> {
    _deconnecter(setInfoIdmg, changerInfoUsager, setConnecte, setEtatProtege, changerErrConnexion)
  }, [changerInfoUsager, changerErrConnexion])

  const rootProps = {
    connecte, infoIdmg, etatProtege, nomUsager, dateChargementCle,
    setErr, deconnecter,
  }

  let contenu
  if(!workers) {
    contenu = <p>Chargement de la page</p>
  } else if(!nomUsager) {
    // Authentifier
    contenu = (
      <Authentifier workers={workers}
                    rootProps={rootProps}
                    initialiserClesWorkers={_initialiserClesWorkers}
                    setInfoUsager={changerInfoUsager}
                    confirmerAuthentification={changerInfoUsager} />
    )
  } else {
    contenu = (
      <>
        <AlertConnexionPerdue show={!connecte} />

        <AlertReauthentifier show={connecte && !etatProtege}
                             nomUsager={nomUsager}
                             infoUsager={infoUsager}
                             workers={workers}
                             confirmerAuthentification={changerInfoUsager} />

        <AccueilUsager workers={workers}
                       rootProps={rootProps} />
      </>
    )
  }

  return (
    <Layout rootProps={rootProps}>

      <Suspense fallback={<ChargementEnCours />}>
        <Container className="contenu">
          <AlertError err={err} />

          {contenu}

        </Container>
      </Suspense>

    </Layout>
  )

}

function ChargementEnCours(props) {
  return (
    <p>Chargement en cours</p>
  )
}

function AlertError(props) {
  return (
    <Alert show={props.err?true:false} closeable>
      <Alert.Heading>Erreur</Alert.Heading>
      <pre>{props.err}</pre>
    </Alert>
  )
}

function AlertConnexionPerdue(props) {
  return (
    <Alert variant="danger" show={props.show}>
      <Alert.Heading>Connexion perdue</Alert.Heading>
    </Alert>
  )
}

// setWorkers, setInfoIdmg, setInfoUsager, setConnecte, setEtatProtege
async function init(setWorkers, setInfoIdmg, setConnecte, setEtatProtege, changerInfoUsager, setDateChargementCle, setErrConnexion) {
  // Preparer workers
  await initialiserWorkers(setWorkers)

  // Verifier si on a deja une session - initialise session au besoin (requis pour socket.io)
  const infoUsager = await verifierSession()
  const nomUsager = infoUsager.nomUsager
  if(nomUsager) {
    console.debug("Session existante pour usager : %s", nomUsager)
    initialiserClesWorkers(nomUsager, {chiffrage: _chiffrageWorker, connexion: _connexionWorker}, setDateChargementCle)
      .catch(err=>{
        console.warn("Erreur initialiseCleWorkers %O", err)
      })
  }

  await connecterSocketIo(setInfoIdmg, changerInfoUsager, setConnecte, setEtatProtege, setErrConnexion)

  if(nomUsager) {
    // Tenter de reconnecter les listeners proteges
    reconnecter(nomUsager, setConnecte, changerInfoUsager, setErrConnexion)
  }

  if('storage' in navigator && 'estimate' in navigator.storage) {
    navigator.storage.estimate().then(estimate=>{
      console.debug("Estime d'espace de storage : %O", estimate)
    })
  }
}

async function initialiserWorkers(setWorkers) {
  if(_connexionWorker === undefined && _chiffrageWorker  === undefined) {
    // Initialiser une seule fois
    _connexionWorker = false
    _chiffrageWorker = false

    const {
      setupWorkers,
      // cleanupWorkers,
    } = require('../workers/workers.load')
    // _cleanupWorkers = cleanupWorkers

    console.debug("Setup workers")
    const {chiffrage, connexion} = await setupWorkers()

    console.debug("Workers initialises : \nchiffrage %O, \nconnexion %O", chiffrage, connexion)

    // Conserver reference globale vers les workers/instances
    _connexionWorker = connexion.webWorker
    // _connexionInstance = connexion.workerInstance
    _chiffrageWorker = chiffrage.webWorker
    // _chiffrageInstance = chiffrage.workerInstance

    const workers = {connexion: _connexionWorker, chiffrage: _chiffrageWorker}
    setWorkers(workers)
  }
}

async function verifierSession() {
  /* Verifier l'etat de la session usager. Va aussi creer le cookie de session
     (au besoin). Requis avant la connexion socket.io. */
  const axios = await import('axios')
  try {
    const reponseUser = await axios.get('/millegrilles/authentification/verifier')
    console.debug("User response : %O", reponseUser)
    const headers = reponseUser.headers

    const userId = headers['x-user-id']
    const nomUsager = headers['x-user-name']

    return {userId, nomUsager}
  } catch(err) {
    if(err.isAxiosError && err.response.status === 401) {
      return false
    }
    console.error("Erreur verif session usager : %O", err)
    return false
  }
}

// async function initialiser(setUserId, setNomUsager) {
//   /* Charger les workers */
//   const {preparerWorkersAvecCles} = require('../workers/workers.load')
//
//   console.debug("Verifier authentification (confirmation du serveur)")
//   const axios = await import('axios')
//   const promiseAxios = axios.get('/millegrilles/authentification/verifier')
//
//   const reponseUser = await promiseAxios
//   console.debug("Info /verifier axios : %O", reponseUser)
//   const headers = reponseUser.headers
//
//   const userId = headers['user-id']
//   const nomUsager = headers['user-name']
//
//   if(nomUsager) {
//     console.debug("Preparer workers avec cles pour usager : %s", nomUsager)
//
//     setUserId(userId)
//     setNomUsager(nomUsager)
//     await preparerWorkersAvecCles(nomUsager, [_chiffrageWorker, _connexionWorker])
//     console.debug("Cles pour workers pretes")
//
//     // connexion.webWorker.connecter()
//     // connexion.webWorker.socketOn('connect', listenersConnexion.reconnectSocketIo)
//     // connexion.webWorker.socketOn('modeProtege', setEtatProtege)
//
//     const infoCertificat = await _connexionWorker.getCertificatFormatteur()
//     setNiveauxSecurite(infoCertificat.extensions.niveauxSecurite)
//
//   } else {
//     console.debug("Usage non-authentifie, initialisation workers incomplete")
//   }
// }

async function initialiserClesWorkers(nomUsager, workers, setDateChargementCle) {
  // try {
  const {preparerWorkersAvecCles} = require('../workers/workers.load')
  await preparerWorkersAvecCles(nomUsager, [workers.chiffrage, workers.connexion])
  setDateChargementCle(new Date())
  console.debug("Cles pour workers initialisees")
  // } catch(err) {
  //   console.warn("Erreur init db usager : %O", err)
  // }
}

async function connecterSocketIo(setInfoIdmg, setInfoUsager, setConnecte, setEtatProtege, setErrConnexion) {

  const infoIdmg = await _connexionWorker.connecter({location: window.location.href})
  console.debug("Connexion socket.io completee, info idmg : %O", infoIdmg)
  // this.setState({...infoIdmg, connecte: true})
  setInfoIdmg(infoIdmg)
  // setInfoUsager(infoIdmg)
  setConnecte(true)

  _connexionWorker.socketOn('disconnect', comlinkProxy(_ =>{
    console.debug("Deconnexion (modeProtege=false, connecte=false)")
    setEtatProtege(false)
    setConnecte(false)
  }))

  _connexionWorker.socketOn('modeProtege', comlinkProxy(reponse => {
    console.debug("Toggle mode protege, nouvel etat : %O", reponse)
    const modeProtege = reponse.etat
    setEtatProtege(modeProtege)
  }))

}

async function reconnecter(nomUsager, setConnecte, setInfoUsager, setErrConnexion) {
  console.debug("Reconnexion usager %s", nomUsager)
  if(!nomUsager) {
    console.warn("Erreur reconnexion, nom usager non defini")
    setErrConnexion(true)
  }
  setConnecte(true)

  const infoUsager = await _connexionWorker.getInfoUsager(nomUsager)
  console.debug("Information usager recue sur reconnexion : %O", infoUsager)

  const challengeCertificat = infoUsager.challengeCertificat
  const messageFormatte = await _chiffrageWorker.formatterMessage(
    challengeCertificat, 'signature', {attacherCertificat: true})

  // Emettre demander d'authentification secondaire - va etre accepte
  // si la session est correctement initialisee.
  try {
    const resultat = await _connexionWorker.authentifierCertificat(messageFormatte)
    setInfoUsager(resultat)
    console.debug("Resultat reconnexion %O", resultat)
  } catch(err) {
    console.warn("Erreur de reconnexion : %O", err)
    setErrConnexion(true)
  }
}

async function _deconnecter(setInfoIdmg, setInfoUsager, setConnecte, setEtatProtege, setErrConnexion) {
  setInfoIdmg('')
  setInfoUsager('')  // Reset aussi nomUsager

  // Deconnecter socket.io pour detruire la session, puis reconnecter pour login
  await _connexionWorker.deconnecter()
  await _chiffrageWorker.clearInfoSecrete()

  // Forcer l'expulsion de la session de l'usager
  const axios = await import('axios')
  await axios.get('/millegrilles/authentification/fermer')

  // Preparer la prochaine session (avec cookie)
  await axios.get('/millegrilles/authentification/verifier')
    .catch(err=>{/*Erreur 401 - OK*/})
  await connecterSocketIo(setInfoIdmg, setInfoUsager, setConnecte, setEtatProtege, setErrConnexion)
}

async function callbackChallengeCertificat(challenge, cb) {
  /* Utilise pour repondre a une connexion / reconnexion socket.io */
  console.debug("callbackChallengeCertificat challenge=%O", challenge)
  try {
    const challengeExtrait = {
      date: challenge.challengeCertificat.date,
      data: challenge.data,
    }

    if(_chiffrageWorker) {

      const messageFormatte = await _chiffrageWorker.formatterMessage(
        challengeExtrait, 'signature', {attacherCertificat: true})

      console.debug("Reponse challenge callback %O", messageFormatte)
      cb(messageFormatte)
      return
    }
  } catch(err) {
    console.warn("Erreur traitement App.callbackChallenge : %O", err)
  }
  cb({err: 'Refus de repondre'})
}

function _setTitre(titre) {
  document.title = titre
}
