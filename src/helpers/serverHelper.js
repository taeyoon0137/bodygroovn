import { fetchWithId } from './FileLoader'

const ping = async() => {
	const response = await fetchWithId('/ping');
	const payload = await response.json();
	return response.ok && payload.ok && payload.data.pong ? 'pong' : Promise.reject(new Error('Local server ping failed.'))
}

export {
	ping
}
