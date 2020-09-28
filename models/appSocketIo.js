// Gestion evenements socket.io pour /millegrilles
const debug = require('debug')('millegrilles:maitrecomptes:appSocketIo');
const randomBytes = require('randombytes')
const { pbkdf2 } = require('pbkdf2')
const {
    parseRegisterRequest,
    generateRegistrationChallenge,
    parseLoginRequest,
    generateLoginChallenge,
    verifyAuthenticatorAssertion,
} = require('@webauthn/server');
const {
    splitPEMCerts, verifierSignatureString, signerContenuString,
    validerCertificatFin, calculerIdmg, chargerClePrivee, chiffrerPrivateKey,
    matchCertificatKey, calculerHachageCertificatPEM, chargerCertificatPEM,
    verifierChallengeCertificat, validerChaineCertificats,
  } = require('millegrilles.common/lib/forgecommon')
const { genererCSRIntermediaire, genererCertificatNavigateur, genererKeyPair } = require('millegrilles.common/lib/cryptoForge')

const PBKDF2_KEYLEN = 64,
      PBKDF2_HASHFUNCTION = 'sha512'

function configurationEvenements(socket) {
  const configurationEvenements = {
    listenersPrives: [
      {eventName: 'disconnect', callback: _=>{deconnexion(socket)}},
      {eventName: 'downgradePrive', callback: params => {downgradePrive(socket, params)}},
      {eventName: 'getInfoIdmg', callback: (params, cb) => {getInfoIdmg(socket, params, cb)}},
      {eventName: 'upgradeProteger', callback: params => {upgradeProteger(socket, params)}},
      {eventName: 'changerApplication', callback: (params, cb) => {changerApplication(socket, params, cb)}},
      {eventName: 'subscribe', callback: (params, cb) => {subscribe(socket, params, cb)}},
      {eventName: 'unsubscribe', callback: (params, cb) => {unsubscribe(socket, params, cb)}},
    ],
    listenersProteges: [
      {eventName: 'associerIdmg', callback: params => {
        debug("Associer idmg")
      }},
      {eventName: 'changerMotDePasse', callback: async (params, cb) => {
        const resultat = await changerMotDePasse(socket, params)
        cb({resultat})
      }},
      {eventName: 'genererMotdepasse', callback: params => {
        debug("Generer mot de passe")
      }},
      {eventName: 'ajouterU2f', callback: async (params, cb) => {
        debug("Ajouter U2F")
        const resultat = await ajouterU2F(socket, params)
        cb({resultat})
      }},
      {eventName: 'desactiverU2f', callback: params => {
        debug("Desactiver U2F")
      }},
      {eventName: 'changerMotDePasse', callback: async (params, cb) => {
        debug("Changer mot de passe")
        const resultat = await changerMotDePasse(socket, params)
        cb({resultat})
      }},
      {eventName: 'genererMotdepasse', callback: params => {
        debug("Generer mot de passe")
      }},
      {eventName: 'ajouterU2f', callback: async params => {
        debug("Ajouter U2F")
        const resultat = await ajouterU2F(socket, params)
        cb({resultat})
      }},
      {eventName: 'desactiverMotdepasse', callback: params => {
        debug("Desactiver mot de passe")
      }},
      {eventName: 'genererCertificatNavigateur', callback: (params, cb) => {
        genererCertificatNavigateurWS(socket, params, cb)
      }},
    ],
    subscriptionsPrivees: [],
    subscriptionsProtegees: [],
  }

  return configurationEvenements
}

function deconnexion(socket) {
  debug("Deconnexion %s", socket.id)
}

function ajouterMotdepasse(req, res, next) {
  var infoCompteUsager = req.compteUsager

  // Verifier si un mot de passe existe deja
  if(infoCompteUsager.motdepasse) {
    debug("Mot de passe existe deja, il faut utiliser le formulaire de changement")
    return res.sendStatus(403);
  } else {
    const {motdepasseNouveau} = req.body
    var nomUsager = req.nomUsager

    const estProprietaire = req.sessionUsager.estProprietaire
    if(estProprietaire && req.body['nom-usager']) {
      nomUsager = req.body['nom-usager']
    }

    genererMotdepasse(motdepasseNouveau)
    .then(infoMotdepasse => {
      req.comptesUsagers.changerMotdepasse(nomUsager, infoMotdepasse, estProprietaire)
      if(estProprietaire) {
        // On modifie le nomUsager du proprietaire
        req.sessionUsager.nomUsager = nomUsager
      }
      return res.sendStatus(200)  // OK
    })
    .catch(err=>{
      console.error("Erreur hachage mot de passe")
      console.error(err)
      return res.sendStatus(500)
    })
  }

}

async function changerMotDePasse(socket, params) {
  debug("Changer compte usager")
  debug(params)

  const req = socket.handshake
  const session = req.session
  debug(session)

  if( session.estProprietaire ) {

    const nomUsager = socket.nomUsager
    const infoCompteUsager = await socket.comptesUsagers.infoCompteProprietaire()
    debug(infoCompteUsager)

    debug("Changer mot de passe proprietaire")
    debug(infoCompteUsager)
    const {motdepasseCourantHash, motdepasseNouveauHash} = params

    var {motdepasseHash, iterations, salt} = infoCompteUsager
    var motdepasseActuelHash = infoCompteUsager.motdepasse

    var motDePasseCourantMatch = false
    if( ! motdepasseActuelHash || socket.modeProtege ) {
      // Le mot de passe n'a pas encore ete cree, pas de verification possible
      motDePasseCourantMatch = true
    } else {
      motDePasseCourantMatch = await pbkdf2(
        motdepasseActuelHash, salt, iterations, PBKDF2_KEYLEN, PBKDF2_HASHFUNCTION,
        (err, derivedKey) => {
          if (err) return false

          const hashPbkdf2MotdepasseActuel = derivedKey.toString('base64')
          debug("Rehash du hash avec pbkdf2 : %s (iterations: %d, salt: %s)", hashPbkdf2MotdepasseActuel, iterations, salt)

          return hashPbkdf2MotdepasseActuel === motdepasseHash
        }
      )
    }

    if(motDePasseCourantMatch) {
      // Le mot de passe actuel correspond au hash recu, on applique le changement

      // Generer nouveau salt, iterations et hachage
      const infoMotdepasse = await genererMotdepasse(motdepasseNouveauHash)
      try {
        if(req.session.estProprietaire) {
          await req.comptesUsagers.changerMotdepasseProprietaire(nomUsager, infoMotdepasse)
        } else {
          await req.comptesUsagers.changerMotdepasse(nomUsager, infoMotdepasse)
        }
        return true
      } catch(err) {
        console.error("Erreur hachage mot de passe")
        debug(err)
        return false
      }

    } else {
      console.error("Mismatch mot de passe courant")
      return false
    }

  } else {
    const nomUsager = socket.nomUsager
    const infoCompteUsager = await socket.comptesUsagers.chargerCompte(socket.nomUsager)
    debug(infoCompteUsager)

    debug("Changer mot de passe usager %s", nomUsager)
    debug(infoCompteUsager)
    const {motdepasseCourantHash, motdepasseNouveauHash} = params

    // Charger cle de compte chiffree, dechiffrer, rechiffrer avec nouveau mot de passe
    const idmgCompte = infoCompteUsager.idmgCompte
    const cleCompte = infoCompteUsager.idmgs[idmgCompte].cleChiffreeCompte
    debug("Cle chiffree compte")
    debug(cleCompte)

    try {
      const clePrivee = chargerClePrivee(cleCompte, {password: motdepasseCourantHash})
      const cleCompteRechiffree = chiffrerPrivateKey(clePrivee, motdepasseNouveauHash)
      debug("Cle rechiffree compte")
      debug(cleCompteRechiffree)

      await socket.comptesUsagers.changerCleComptePrive(nomUsager, cleCompteRechiffree)

      return true // Changement reussi

    } catch(err) {
      debug("Erreur changement mot de passe compte usager prive, mauvais mot de passe")
      return false // Echec, mauvais mot de passe courant
    }
  }

  return false
}

function genererMotdepasse(motdepasseNouveau) {
  // Generer nouveau salt et nombre d'iterations
  salt = randomBytes(128).toString('base64')
  iterations = Math.floor(Math.random() * 50000) + 75000

  return new Promise((resolve, reject) => {
    pbkdf2(motdepasseNouveau, salt, iterations, PBKDF2_KEYLEN, PBKDF2_HASHFUNCTION,
      (err, derivedNewKey) => {
        if (err) reject(err);

        const motdepasseHash = derivedNewKey.toString('base64')
        debug("Rehash du nouveau hash avec pbkdf2 : %s (iterations: %d, salt: %s)", motdepasseHash, iterations, salt)

        const info = {
          salt,
          iterations,
          motdepasseHash,
        }
        resolve(info)
      }
    )
  })
}

async function ajouterU2F(socket, params) {
  debug(params)

  const req = socket.handshake
  const session = req.session
  const nomUsager = session.nomUsager,
        hostname = socket.hostname
  debug(session)

  const {desactiverAutres} = params

  // Challenge via Socket.IO

  // const registrationRequest = u2f.request(MG_IDMG);
  debug("Registration request, usager %s, hostname %s", nomUsager, hostname)
  const challengeInfo = {
      relyingParty: { name: hostname },
      user: { id: nomUsager, name: nomUsager }
  }
  const registrationRequest = generateRegistrationChallenge(challengeInfo);
  // debug(registrationRequest)

  const challengeCorrect = await new Promise(async (resolve, reject)=>{
    socket.emit('challengeRegistrationU2F', registrationRequest, async (reponse) => {
      debug("Reponse registration challenge")
      debug(reponse)

      if(reponse.etat) {
        const credentials = reponse.credentials
        const { key, challenge } = parseRegisterRequest(credentials);

        if( !key ) return resolve(false)

        if(challenge === registrationRequest.challenge) {
          if( session.estProprietaire ) {
            debug("Challenge registration OK pour nouvelle cle proprietaire")
            await req.comptesUsagers.ajouterCleProprietaire(key, desactiverAutres)
            return resolve(true)
          } else {
            const nomUsager = session.nomUsager

            debug("Challenge registration OK pour usager %s", nomUsager)
            await req.comptesUsagers.ajouterCle(nomUsager, key, desactiverAutres)
            return resolve(true)
          }
        } else {
          // Challenge mismatch
        }
      } else {
        // Etat incorrect recu du client
      }

      return resolve(false)
    })

  })

  return challengeCorrect

}

function desactiverMotdepasse(req, res, next) {
    const nomUsager = req.nomUsager
    const userInfo = req.compteUsager

    // S'assurer qu'il y a des cles
    if(userInfo.cles && userInfo.cles.length > 0) {
      req.comptesUsagers.supprimerMotdepasse(nomUsager)

      res.sendStatus(200)
    } else {
      debug("Le compte n'a pas au moins une cle U2F, suppression du mot de passe annulee")
      res.sendStatus(500)
    }

}

function desactiverU2f(req, res, next) {
    const nomUsager = req.nomUsager
    const userInfo = req.compteUsager
    const estProprietaire = req.sessionUsager.estProprietaire

    if(estProprietaire) {
      return res.sendStatus(403)  // Option non disponible pour le proprietaire
    }

    debug(userInfo)

    // S'assurer qu'il y a des cles
    if(userInfo.motdepasse) {
      req.comptesUsagers.supprimerCles(nomUsager)

      res.sendStatus(200)
    } else {
      debug("Le compte n'a pas au moins une cle U2F, suppression du mot de passe annulee")
      res.sendStatus(500)
    }

}

async function upgradeProteger(socket, params) {
  debug("upgradeProteger")
  const session = socket.handshake.session

  let compteUsager
  if( session.estProprietaire ) {
    compteUsager = await socket.comptesUsagers.infoCompteProprietaire()
  } else {
    compteUsager = await socket.comptesUsagers.chargerCompte(session.nomUsager)
  }

  // const effectuerUpgrade = () => {
  //   debug("Mode protege - usager")
  //   socket.upgradeProtege(_=>{
  //     socket.modeProtege = true
  //     socket.estProprietaire = session.estProprietaire
  //     socket.emit('modeProtege', {'etat': true})
  //   })
  // }

  var sessionActive = false

  if(session.sessionValidee2Facteurs || session[CONST_AUTH_PRIMAIRE] !== 'certificat') {
    // La session a deja ete verifiee via 2FA, on tente une verification par
    // certificat de navigateur (aucune interaction avec l'usager requise)
    const demandeChallenge = {
      challengeCertificat: {
        date: new Date().getTime(),
        data: Buffer.from(randomBytes(32)).toString('base64'),
      },
      nomUsager: socket.nomUsager
    }

    debug("Emission challenge certificat avec socket.io : %O", demandeChallenge)

    sessionActive = await new Promise((resolve, reject)=>{
      socket.emit('challengeAuthCertificatNavigateur', demandeChallenge, reponse => {
        debug("Recu reponse challenge cert : %O", reponse)
        if(reponse.etat) {
          // Verifier la chaine de certificats
          const {fullchain} = reponse.reponse.certificats
          const chainePem = splitPEMCerts(fullchain)

          // Verifier les certificats et la signature du message
          // Permet de confirmer que le client est bien en possession d'une cle valide pour l'IDMG
          const { cert: certNavigateur, idmg } = validerChaineCertificats(chainePem)

          var certificatValide = true

          const commonName = certNavigateur.subject.getField('CN').value
          if(socket.nomUsager !== commonName) {
            debug("Le certificat ne correspond pas a l'usager : CN=" + commonName)
            certificatValide = false
          }

          // S'assurer que le certificat client correspond au IDMG (O=IDMG)
          const organizationalUnit = certNavigateur.subject.getField('OU').value

          if(organizationalUnit !== 'Navigateur') {
            debug("Certificat fin n'est pas un certificat de Navigateur. OU=" + organizationalUnit)
            certificatValide = false
          } else {
            debug("Certificat fin est de type " + organizationalUnit)
          }

          // Verifier la signature
          if(!certificatValide || !verifierChallengeCertificat(certNavigateur, reponse.reponse.reponseChallenge)) {
            console.error("Signature certificat invalide")
            verificationOk = false
          } else {
            debug("Upgrade protege via certificat de navigateur est valide")

            socket.upgradeProtege(ok=>{
              console.debug("Upgrade protege ok : %s", ok)
              socket.emit('modeProtege', {'etat': true})

              // Conserver dans la session qu'on est alle en mode protege
              // Permet de revalider le mode protege avec le certificat de navigateur
              session.sessionValidee2Facteurs = true
              session.save()
            })

            return resolve(true)  // Termine
          }
        }
        resolve(false)
      })
    })
  }

  if(sessionActive) {
    // Termine
    return sessionActive
  }

  if(compteUsager.u2f) {
    const challengeAuthU2f = generateLoginChallenge(compteUsager.u2f)

    // TODO - Verifier challenge
    socket.emit('challengeAuthU2F', challengeAuthU2f, (reponse) => {
      debug("Reponse challenge")
      debug(reponse)
      socket.upgradeProtege(ok=>{
        console.debug("Upgrade protege ok : %s", ok)
        socket.emit('modeProtege', {'etat': true})

        // Conserver dans la session qu'on est alle en mode protege
        // Permet de revalider le mode protege avec le certificat de navigateur
        session.sessionValidee2Facteurs = true
        session.save()
      })
    })
  } else {
    // Aucun 2FA, on fait juste upgrader a protege
    socket.upgradeProtege(ok=>{
      console.debug("Upgrade protege ok : %s", ok)
      socket.emit('modeProtege', {'etat': true})

      // Conserver dans la session qu'on est alle en mode protege
      // Permet de revalider le mode protege avec le certificat de navigateur
      session.sessionValidee2Facteurs = true
      session.save()
    })
  }

}

function changerApplication(socket, application, cb) {
  debug("Changer application, params:\n%O\nCallback:\n%O", application, cb)
  socket.changerApplication(application, cb)
}

function subscribe(socket, params, cb) {
  debug("subscribe, params:\n%O\nCallback:\n%O", params, cb)
  socket.subscribe(params, cb)
}

function unsubscribe(socket, params, cb) {
  debug("unsubscribe, params:\n%O\nCallback:\n%O", params, cb)
  socket.unsubscribe(params, cb)
}

function downgradePrive(socket, params) {

  // const listenersProteges = socket.listenersProteges
  //
  // listenersProteges.forEach(listenerName => {
  //   debug("Retrait listener %s", listenerName)
  //   socket.removeAllListeners(listenerName)
  // })
  //
  // // Cleanup socket
  // delete socket.listenersProteges

  socket.downgradePrive(_=>{
    socket.modeProtege = false
    socket.emit('modeProtege', {'etat': false})
  })

}

function getInfoIdmg(socket, params, cb) {
  const session = socket.handshake.session
  const comptesUsagers = socket.comptesUsagers

  // TODO - Verifier challenge
  cb({idmgCompte: session.idmgCompte, idmgsActifs: session.idmgsActifs})
}

async function genererCertificatNavigateurWS(socket, params, cb) {
  debug("Generer certificat navigateur, params: %O\nSocket: %O", params, socket)
  const estProprietaire = socket.estProprietaire
  const modeProtege = socket.modeProtege
  const nomUsager = socket.nomUsager || estProprietaire?'proprietaire':''

  const csr = params.csr

  const paramsCreationCertificat = {estProprietaire, modeProtege, nomUsager, csr}
  debug("Parametres creation certificat navigateur\n%O", paramsCreationCertificat)

  if(modeProtege) {
    debug("Handshake du socket sous genererCertificatNavigateurWS : %O", socket.handshake)
    const maitreClesDao = socket.handshake.maitreClesDao

    const reponse = await maitreClesDao.signerCertificatNavigateur(csr, nomUsager, estProprietaire)
    debug("Reponse signature certificat:\n%O", reponse)
    cb(reponse)
  }

}

module.exports = {
  configurationEvenements,
}
